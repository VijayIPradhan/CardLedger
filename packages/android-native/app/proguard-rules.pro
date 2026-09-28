# keep defaults

# Firebase Cloud Messaging
-keepclassmembers class com.imvj.cardledger.service.CardLedgerFirebaseMessagingService {
    *;
}
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**
