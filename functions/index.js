const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

/**
 * AI EARNINGS PREDICTION ENGINE
 *
 * How it works:
 * 1. Triggered when a new shift is written to Firestore (or on schedule)
 * 2. Aggregates all shifts by (zone, dayOfWeek, hour)
 * 3. Calculates average earnings per hour for each slot
 * 4. Runs a simple confidence-weighted prediction:
 *    predictedEarnings = weightedAvg(historical earnings) + peakPay bonus
 * 5. Stores predictions back to zones/{zoneId}/predictions
 *
 * This is a production-grade MVP model. As more data accumulates,
 * the predictions become more accurate. No TensorFlow needed.
 */

exports.calculateZonePredictions = functions.firestore
  .document('users/{uid}/shifts/{shiftId}')
  .onWrite(async (change, context) => {
    const { uid } = context.params;
    await computePredictions(uid);
  });

// Also run on a schedule every 6 hours to refresh
exports.scheduledPredictions = functions.pubsub
  .schedule('every 6 hours')
  .onRun(async (context) => {
    const usersSnap = await db.collection('users').get();
    const promises = [];
    usersSnap.forEach(doc => {
      promises.push(computePredictions(doc.id));
    });
    await Promise.allSettled(promises);
    functions.logger.log(`Predictions computed for ${promises.length} users`);
    return null;
  });

async function computePredictions(uid) {
  try {
    // Get all shifts for this user
    const shiftsSnap = await db
      .collection('users')
      .doc(uid)
      .collection('shifts')
      .get();

    if (shiftsSnap.empty) {
      functions.logger.log(`No shifts for user ${uid}, skipping`);
      return;
    }

    // Aggregate by zone
    const zoneData = {};
    shiftsSnap.forEach(doc => {
      const shift = doc.data();
      const zone = shift.zone || 'unknown';
      if (!zoneData[zone]) {
        zoneData[zone] = {
          totalEarnings: 0,
          totalHours: 0,
          totalDeliveries: 0,
          shiftCount: 0,
          byHour: {},
          byDay: {},
        };
      }
      const z = zoneData[zone];
      z.totalEarnings += shift.earnings || 0;
      z.totalHours += shift.hours || 0;
      z.totalDeliveries += shift.deliveries || 0;
      z.shiftCount += 1;

      // Track by hour bucket
      const date = shift.date ? new Date(shift.date + 'T12:00:00') : new Date();
      const hour = shift.timeOfDay !== undefined ? shift.timeOfDay : date.getHours();
      const dayOfWeek = shift.dayOfWeek !== undefined ? shift.dayOfWeek : date.getDay();

      if (!z.byHour[hour]) z.byHour[hour] = { earnings: 0, hours: 0, count: 0 };
      z.byHour[hour].earnings += shift.earnings || 0;
      z.byHour[hour].hours += shift.hours || 0;
      z.byHour[hour].count += 1;

      if (!z.byDay[dayOfWeek]) z.byDay[dayOfWeek] = { earnings: 0, hours: 0, count: 0 };
      z.byDay[dayOfWeek].earnings += shift.earnings || 0;
      z.byDay[dayOfWeek].hours += shift.hours || 0;
      z.byDay[dayOfWeek].count += 1;
    });

    // Get zones reference
    const zonesSnap = await db.collection('zones').get();
    const zones = {};
    zonesSnap.forEach(doc => {
      zones[doc.id] = doc.data();
    });

    // Compute predictions for each zone
    const batch = db.batch();
    const predictionsRef = db.collection('users').doc(uid).collection('predictions');

    for (const [zoneId, data] of Object.entries(zoneData)) {
      const avgRate = data.totalHours > 0 ? data.totalEarnings / data.totalHours : 0;
      const peakPay = zones[zoneId]?.peakPay || 0;

      // Generate predictions for each hour of the week
      const hourlyPredictions = [];
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      for (let day = 0; day < 7; day++) {
        for (let hour = 0; hour < 24; hour++) {
          const dayData = data.byDay[day];
          const hourData = data.byHour[hour];
          const dayAvgRate = dayData?.hours > 0 ? dayData.earnings / dayData.hours : null;
          const hourAvgRate = hourData?.hours > 0 ? hourData.earnings / hourData.hours : null;

          // Confidence-weighted prediction
          let predictedRate = avgRate;
          let confidence = 'low';

          if (dayAvgRate !== null && hourAvgRate !== null) {
            // Both day and hour data available — high confidence
            predictedRate = (hourAvgRate * 0.6 + dayAvgRate * 0.3 + avgRate * 0.1);
            confidence = 'high';
          } else if (dayAvgRate !== null || hourAvgRate !== null) {
            // Partial data — medium confidence
            predictedRate = (dayAvgRate || hourAvgRate || avgRate) * 0.7 + avgRate * 0.3;
            confidence = 'medium';
          }

          // Add peak pay bonus if peak hours (lunch: 11-13, dinner: 17-20)
          const isPeakTime = (hour >= 11 && hour <= 13) || (hour >= 17 && hour <= 20);
          const peakBonus = isPeakTime ? peakPay * 0.5 : 0;
          predictedRate += peakBonus;

          hourlyPredictions.push({
            day,
            dayName: days[day],
            hour,
            predictedRate: Math.round(predictedRate * 100) / 100,
            confidence,
            dataPoints: (dayData?.count || 0) + (hourData?.count || 0),
            isPeakTime,
          });
        }
      }

      // Find best hours
      const sorted = [...hourlyPredictions].sort((a, b) => b.predictedRate - a.predictedRate);
      const bestHours = sorted.slice(0, 5);

      // Store predictions
      const predDoc = predictionsRef.doc(zoneId);
      batch.set(predDoc, {
        zoneId,
        avgRate: Math.round(avgRate * 100) / 100,
        totalEarnings: data.totalEarnings,
        totalHours: data.totalHours,
        totalDeliveries: data.totalDeliveries,
        shiftCount: data.shiftCount,
        bestHours,
        hourlyPredictions,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
    functions.logger.log(`Predictions saved for user ${uid} — ${Object.keys(zoneData).length} zones`);
  } catch (error) {
    functions.logger.error(`Error computing predictions for user ${uid}:`, error);
  }
}

/**
 * GET BEST ZONE RIGHT NOW — Callable function
 * Returns the best zone(s) to dash in at this moment
 */
exports.getBestZonesNow = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const uid = context.auth.uid;
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay();

  try {
    const predictionsSnap = await db
      .collection('users')
      .doc(uid)
      .collection('predictions')
      .get();

    const results = [];
    predictionsSnap.forEach(doc => {
      const data = doc.data();
      const currentSlot = data.hourlyPredictions?.find(
        p => p.day === currentDay && p.hour === currentHour
      );
      if (currentSlot) {
        results.push({
          zoneId: data.zoneId,
          predictedRate: currentSlot.predictedRate,
          confidence: currentSlot.confidence,
          dataPoints: currentSlot.dataPoints,
          isPeakTime: currentSlot.isPeakTime,
          avgRate: data.avgRate,
        });
      }
    });

    results.sort((a, b) => b.predictedRate - a.predictedRate);
    return { bestZones: results.slice(0, 5), currentTime: { day: currentDay, hour: currentHour } };
  } catch (error) {
    throw new functions.https.HttpsError('internal', 'Failed to get predictions');
  }
});
