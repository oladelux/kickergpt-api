# Mobile In-App Purchases & Ad Rewards - Backend Implementation

This document describes the backend implementation for mobile app ad watching and in-app purchase features.

## 🎯 Overview

The backend now supports:
- **Ad Rewards**: Users can watch ads to earn credits with daily limits and cooldown periods
- **Mobile IAP Verification**: Verify Google Play (and iOS App Store) purchases and grant credits
- **Purchase Sync**: Sync purchases from RevenueCat
- **Enhanced Credit System**: Track ad credits, purchased credits, addon credits, and monthly allowance separately

## 📦 Installation

### Install Required Dependencies

```bash
npm install googleapis
```

### Environment Variables

Add these to your `.env` file:

```bash
# Ad Configuration
MAX_ADS_PER_DAY=20
AD_COOLDOWN_MINUTES=5
CREDITS_PER_AD=5

# Google Play API
GOOGLE_PLAY_SERVICE_ACCOUNT_KEY=/path/to/service-account-key.json
GOOGLE_PLAY_PACKAGE_NAME=com.bootroombot.app

# RevenueCat (optional)
REVENUECAT_API_KEY=your_revenuecat_api_key
```

## 🗄️ Database Migration

Run the migration to add new tables and columns:

```bash
npm run migration:run
```

This creates:
- `mobile_purchases` table for transaction audit trail
- New columns in `prompt_usage` table:
  - `adCredits` - credits earned from watching ads
  - `purchasedCredits` - credits bought via IAP
  - `lastAdWatchedAt` - timestamp of last ad watch
  - `adsWatchedToday` - counter for daily ad limit
  - `adsWatchDate` - date of ad watch for daily reset

## 🔌 API Endpoints

### 1. Ad Reward Endpoint

**POST** `/api/v1/ads/reward`

Grant credits when user completes watching a rewarded video ad.

**Request:**
```json
{
  "creditsEarned": 5
}
```

**Response:**
```json
{
  "success": true,
  "creditsGranted": 5,
  "newBalance": {
    "adCreditsRemaining": 25,
    "totalCreditsRemaining": 125
  },
  "nextAdAvailable": "2025-12-19T15:30:00Z"
}
```

**Business Logic:**
- Validates credits earned matches configured amount
- Resets daily counter if date changed
- Checks daily limit (20 ads/day by default)
- Enforces cooldown period (5 minutes by default)
- Grants credits and updates tracking fields

**Error Responses:**
- `400 Bad Request` - Invalid credits amount
- `403 Forbidden` - Daily limit reached or cooldown active

---

### 2. Mobile IAP Verification Endpoint

**POST** `/api/v1/purchases/verify-mobile`

Verify a purchase made through Google Play or Apple App Store.

**Request:**
```json
{
  "productId": "credits_50",
  "transactionId": "GPA.1234-5678-9012-34567",
  "platform": "android"
}
```

**Response:**
```json
{
  "success": true,
  "creditsGranted": 50,
  "transactionId": "GPA.1234-5678-9012-34567",
  "newBalance": {
    "purchasedCreditsRemaining": 50,
    "totalCreditsRemaining": 150
  }
}
```

**Product IDs:**
- `credits_10` → 10 credits
- `credits_50` → 50 credits
- `credits_100` → 100 credits

**Business Logic:**
- Checks for duplicate transaction (prevents double-crediting)
- Verifies purchase with Google Play Developer API
- Maps product ID to credit amount
- Grants credits and stores transaction record

**Error Responses:**
- `400 Bad Request` - Invalid product ID or verification failed
- `409 Conflict` - Transaction already processed

---

### 3. Sync Purchases Endpoint

**POST** `/api/v1/purchases/sync`

Sync purchases from RevenueCat (used for restore purchases).

**Request:**
```json
{}
```

**Response:**
```json
{
  "success": true,
  "purchasesSynced": 2,
  "creditsAdded": 60
}
```

---

### 4. Updated Subscription Usage Endpoint

**GET** `/api/v1/subscriptions/usage`

Returns comprehensive credit information.

**Response:**
```json
{
  "monthlyAllowance": 100,
  "monthlyUsed": 25,
  "monthlyRemaining": 75,
  "addonCreditsRemaining": 10,
  "adCreditsRemaining": 15,
  "purchasedCreditsRemaining": 50,
  "totalCreditsRemaining": 150
}
```

**Calculation:**
```
totalCreditsRemaining = monthlyRemaining + addonCreditsRemaining + adCreditsRemaining + purchasedCreditsRemaining
```

## 💳 Credit Consumption Priority

When a user sends a chat message, credits are consumed in this order:

1. **Ad Credits** (free credits from watching ads)
2. **Purchased Credits** (credits bought via IAP)
3. **Addon Credits** (credits bought via Stripe on web)
4. **Monthly Allowance** (subscription credits)

This ensures users get the best value - free/paid credits are used before subscription credits.

## 🔐 Google Play Setup

### 1. Service Account Creation

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new service account
3. Download the JSON key file
4. Save it to your server (path in `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY`)

### 2. Enable API

1. Enable Google Play Developer API in your project
2. Grant the service account access in Google Play Console
3. Go to Settings → API access
4. Link the service account

### 3. Create In-App Products

In Google Play Console → Monetization → In-app products:

- **Product ID**: `credits_10`, **Price**: $2.99
- **Product ID**: `credits_50`, **Price**: $9.99
- **Product ID**: `credits_100`, **Price**: $17.99

## 🧪 Testing

### Test Ad Reward

```bash
curl -X POST https://your-api.com/api/v1/ads/reward \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"creditsEarned": 5}'
```

### Test IAP Verification

```bash
curl -X POST https://your-api.com/api/v1/purchases/verify-mobile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "credits_50",
    "transactionId": "TEST_TRANSACTION_ID",
    "platform": "android"
  }'
```

### Development Mode

In development (`NODE_ENV=development`), the Android purchase verification will allow unverified purchases with a warning. **DO NOT USE IN PRODUCTION!**

## 🔒 Security Features

1. **Rate Limiting**: Daily ad limit (20/day) enforced
2. **Cooldown Period**: 5 minutes between ads
3. **Transaction Deduplication**: Each transaction can only be processed once
4. **Receipt Verification**: All purchases verified with Google Play API
5. **Audit Logging**: All transactions stored in `mobile_purchases` table
6. **JWT Authentication**: All endpoints require valid authentication

## 📊 Database Schema

### `mobile_purchases` Table

```sql
CREATE TABLE mobile_purchases (
  id UUID PRIMARY KEY,
  userId UUID REFERENCES user(id),
  productId VARCHAR(100),
  transactionId VARCHAR(255) UNIQUE,
  platform VARCHAR(20),
  creditsGranted INTEGER,
  purchaseDate TIMESTAMP,
  verifiedAt TIMESTAMP,
  rawReceipt TEXT,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
);
```

### `prompt_usage` Table (New Columns)

```sql
ALTER TABLE prompt_usage
  ADD COLUMN adCredits INTEGER DEFAULT 0,
  ADD COLUMN purchasedCredits INTEGER DEFAULT 0,
  ADD COLUMN lastAdWatchedAt TIMESTAMP,
  ADD COLUMN adsWatchedToday INTEGER DEFAULT 0,
  ADD COLUMN adsWatchDate DATE;
```

## 🏗️ Architecture

### Modules Created

1. **AdsModule** (`src/ads/`)
   - `AdsController` - REST endpoints
   - `AdsService` - Business logic for ad rewards
   - `ads.config.ts` - Configuration for ad limits

2. **MobilePurchasesModule** (`src/mobile-purchases/`)
   - `MobilePurchasesController` - REST endpoints
   - `MobilePurchasesService` - IAP verification logic
   - `MobilePurchaseRepository` - Database operations
   - `google-play.config.ts` - Google Play API config

### Updated Modules

1. **PromptUsageModule**
   - Added `adCredits` and `purchasedCredits` tracking
   - Updated consumption logic with priority order
   - New methods: `addAdCredits()`, `addPurchasedCredits()`

2. **SubscriptionsModule**
   - Enhanced usage summary with all credit types

## 🎯 Next Steps

1. **Install googleapis**: `npm install googleapis`
2. **Set up Google Play service account** (see above)
3. **Run migration**: `npm run migration:run`
4. **Add environment variables** to `.env`
5. **Test endpoints** with curl or Postman
6. **Integrate with mobile app**

## 📝 Notes

- iOS verification is stubbed - implement when needed
- RevenueCat sync is placeholder - implement based on your needs
- Transaction records stored indefinitely for audit purposes
- Consider adding admin endpoints to view purchase history
- Monitor for fraud patterns in `mobile_purchases` table

## 🐛 Troubleshooting

### "Service account not found"
- Verify `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY` path is correct
- Ensure service account has proper permissions in Google Play Console

### "Purchase verification failed"
- Check that product ID exists in Google Play Console
- Verify service account is linked to your app
- In development, check logs for detailed error messages

### "Transaction already processed"
- This is expected behavior to prevent double-crediting
- Client should handle this gracefully

## 📚 Resources

- [Google Play Developer API](https://developers.google.com/android-publisher)
- [RevenueCat Documentation](https://docs.revenuecat.com/)
- [NestJS Documentation](https://docs.nestjs.com/)

