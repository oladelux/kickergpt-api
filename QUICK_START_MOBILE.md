# 🚀 Quick Start - Mobile Features

Get the mobile ad rewards and in-app purchases backend running in 5 minutes.

## Step 1: Install Dependencies (30 seconds)

```bash
npm install googleapis
```

## Step 2: Add Environment Variables (1 minute)

Add to your `.env` file:

```bash
# Ad Configuration
MAX_ADS_PER_DAY=20
AD_COOLDOWN_MINUTES=5
CREDITS_PER_AD=5

# Google Play API (use placeholder for now, update later)
GOOGLE_PLAY_SERVICE_ACCOUNT_KEY=/path/to/service-account.json
GOOGLE_PLAY_PACKAGE_NAME=com.bootroombot.app
```

## Step 3: Run Migration (30 seconds)

```bash
npm run migration:run
```

This creates the necessary database tables and columns.

## Step 4: Start Server (30 seconds)

```bash
npm run start:dev
```

## Step 5: Test the Endpoints (2 minutes)

### Get a JWT Token
First, log in to get your JWT token:

```bash
curl -X POST http://localhost:3000/api/v1/auth/email/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "your-password"
  }'
```

Save the `token` from the response.

### Test Ad Reward

```bash
curl -X POST http://localhost:3000/api/v1/ads/reward \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"creditsEarned": 5}'
```

**Expected Response:**
```json
{
  "success": true,
  "creditsGranted": 5,
  "newBalance": {
    "adCreditsRemaining": 5,
    "totalCreditsRemaining": 15
  },
  "nextAdAvailable": "2025-12-19T15:35:00Z"
}
```

### Test Credit Balance

```bash
curl -X GET http://localhost:3000/api/v1/subscriptions/usage \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Expected Response:**
```json
{
  "monthlyAllowance": 10,
  "monthlyUsed": 0,
  "monthlyRemaining": 10,
  "addonCreditsRemaining": 0,
  "adCreditsRemaining": 5,
  "purchasedCreditsRemaining": 0,
  "totalCreditsRemaining": 15
}
```

### Test Purchase Verification (Development Mode)

In development mode, verification is bypassed for testing:

```bash
curl -X POST http://localhost:3000/api/v1/purchases/verify-mobile \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "credits_50",
    "transactionId": "TEST_TRANSACTION_123",
    "platform": "android"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "creditsGranted": 50,
  "transactionId": "TEST_TRANSACTION_123",
  "newBalance": {
    "purchasedCreditsRemaining": 50,
    "totalCreditsRemaining": 65
  }
}
```

## ✅ You're Done!

The backend is now ready for mobile app integration.

## 🎯 Next Steps

### For Development/Testing
You're all set! The endpoints work in development mode.

### For Production
You'll need to set up Google Play:

1. **Create Google Play Service Account** (15 minutes)
   - Go to Google Cloud Console
   - Create service account
   - Download JSON key
   - Enable Google Play Developer API

2. **Link to Play Console** (5 minutes)
   - Open Google Play Console
   - Go to Setup → API access
   - Link service account

3. **Create In-App Products** (10 minutes)
   - Create `credits_10`, `credits_50`, `credits_100`
   - Set prices ($2.99, $9.99, $17.99)

4. **Update Environment Variables**
   - Point `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY` to actual key file
   - Set `NODE_ENV=production`

**Full setup guide:** [INSTALLATION_STEPS.md](./INSTALLATION_STEPS.md)

## 📱 Mobile App Integration

Share this endpoint information with your mobile developers:

**Base URL:** `http://localhost:3000/api/v1` (or your production URL)

**Endpoints:**
- `POST /ads/reward` - Grant ad credits
- `POST /purchases/verify-mobile` - Verify IAP
- `GET /subscriptions/usage` - Get credit balance

**Mobile Integration Guide:** [docs/MOBILE_APP_INTEGRATION.md](./docs/MOBILE_APP_INTEGRATION.md)

## 🐛 Troubleshooting

### Error: "Cannot find module 'googleapis'"
```bash
npm install googleapis
```

### Error: "Migration failed"
Make sure your database is running:
```bash
# Check database connection in .env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=your_db_name
```

### Error: "Unauthorized"
Make sure you're using a valid JWT token from the login endpoint.

### Error: "Service account not found"
This is OK in development mode. The system will work with a placeholder.

## 📚 Documentation

- **[README](./README_MOBILE_FEATURES.md)** - Complete overview
- **[Installation](./INSTALLATION_STEPS.md)** - Detailed setup
- **[Mobile Integration](./docs/MOBILE_APP_INTEGRATION.md)** - For app developers
- **[Full Docs](./docs/MOBILE_IAP_ADS_SETUP.md)** - Technical details

## 🎉 Success!

Your backend now supports:
- ✅ Rewarded video ads
- ✅ In-app purchases
- ✅ Credit tracking
- ✅ Purchase verification

Start integrating with your mobile app!

