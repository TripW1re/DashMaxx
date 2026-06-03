// ===== FIREBASE SETUP INSTRUCTIONS =====
// To configure Firebase for DashMaxx:
//
// 1. Go to https://console.firebase.google.com
// 2. Create a new project (or use existing)
// 3. Enable these services:
//    - Authentication → Anonymous sign-in
//    - Cloud Firestore → Create database (start in test mode)
//    - Cloud Functions (pay-as-you-go or Blaze plan required)
//
// 4. Register a Web app in Project Settings
//    - Copy the config object values
//
// 5. Set environment variables (choose one):
//
//    Option A: app.json extra (easiest)
//    Edit app.json "extra" section with your Firebase values
//
//    Option B: .env file (create at project root)
//    EXPO_PUBLIC_FIREBASE_API_KEY=AIza...
//    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
//    EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
//    EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
//    EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
//    EXPO_PUBLIC_FIREBASE_APP_ID=...
//
// 6. The app will automatically use Firebase when configured.
//    Without configuration, it runs entirely offline using AsyncStorage.
//
// 7. Deploy Cloud Functions:
//    cd functions
//    npm install
//    firebase deploy --only functions
//
// ===== FIRESTORE SECURITY RULES =====
// Place in firestore.rules at project root:
//
// rules_version = '2';
// service cloud.firestore {
//   match /databases/{database}/documents {
//     match /users/{uid} {
//       allow read, write: if request.auth != null && request.auth.uid == uid;
//       match /shifts/{shiftId} {
//         allow read, write: if request.auth != null && request.auth.uid == uid;
//       }
//     }
//     match /zones/{zoneId} {
//       allow read: if true;
//       allow write: if request.auth != null && request.auth.token.isAdmin == true;
//     }
//     match /social/posts/{postId} {
//       allow read: if true;
//       allow create: if request.auth != null;
//       allow update: if request.auth != null;
//     }
//     match /meetups/{meetupId} {
//       allow read: if true;
//       allow write: if request.auth != null;
//     }
//   }
// }
