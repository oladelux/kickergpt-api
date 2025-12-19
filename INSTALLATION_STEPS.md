# Installation Steps for Mobile IAP & Ads Backend

Follow these steps to set up the mobile in-app purchases and ad rewards backend.

## 1. Install Dependencies

```bash
npm install googleapis
```

## 2. Set Up Google Play Service Account

### a. Create Service Account in Google Cloud Console

1. Go to https://console.cloud.google.com/
2. Select your project (or create a new one)
3. Navigate to **IAM & Admin** → **Service Accounts**
4. Click **Create Service Account**
5. Name it (e.g., "google-play-api")
6. Click **Create and Continue**
7. Click **Done**

### b. Create and Download Key

1. Click on the created service account
2. Go to **Keys** tab
3. Click **Add Key** → **Create new key**
4. Choose **JSON** format
5. Download the file
6. Save it to your server (e.g., `/etc/secrets/google-play-service-account.json`)

### c. Enable Google Play Developer API

1. In Google Cloud Console, go to **APIs & Services** → **Library**
2. Search for "Google Play Android Developer API"
3. Click **Enable**

### d. Link Service Account to Google Play Console

1. Go to https://play.google.com/console
2. Select your app
3. Go to **Setup** → **API access**
4. Click **Link** next to your service account
5. Grant permissions (View financial data, Manage orders)

## 3. Create In-App Products in Google Play Console

1. Go to Google Play Console → Your App → **Monetization** → **In-app products**
2. Click **Create product**
3. Create three products:

   **Product 1:**
   - Product ID: `credits_10`
   - Name: "10 Credits"
   - Description: "Purchase 10 chat credits"
   - Price: $2.99 (or your currency equivalent)

   **Product 2:**
   - Product ID: `credits_50`
   - Name: "50 Credits"
   - Description: "Purchase 50 chat credits"
   - Price: $9.99

   **Product 3:**
   - Product ID: `credits_100`
   - Name: "100 Credits"
   - Description: "Purchase 100 chat credits"
   - Price: $17.99

4. Activate each product

## 4. Configure Environment Variables

Add these to your `.env` file:

```bash
# Ad Configuration
MAX_ADS_PER_DAY=20
AD_COOLDOWN_MINUTES=5
CREDITS_PER_AD=5

# Google Play API
GOOGLE_PLAY_SERVICE_ACCOUNT_KEY=/path/to/service-account-key.json
GOOGLE_PLAY_PACKAGE_NAME=com.bootroombot.app

# RevenueCat (optional, if using server-side verification)
REVENUECAT_API_KEY=your_revenuecat_api_key
```

**Important:** Replace:
- `/path/to/service-account-key.json` with the actual path to your downloaded JSON key
- `com.bootroombot.app` with your actual Android package name

## 5. Run Database Migration

```bash
npm run migration:run
```

This will:
- Create the `mobile_purchases` table
- Add new columns to the `prompt_usage` table

## 6. Build and Start the Application

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

## 7. Test the Endpoints

### Test Ad Reward (after getting a JWT token)

```bash
curl -X POST http://localhost:3000/api/v1/ads/reward \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"creditsEarned": 5}'
```

### Test IAP Verification

First, make a test purchase in your Android app, then:

```bash
curl -X POST http://localhost:3000/api/v1/purchases/verify-mobile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "credits_50",
    "transactionId": "YOUR_GOOGLE_PLAY_TRANSACTION_ID",
    "platform": "android"
  }'
```

### Test Usage Endpoint

```bash
curl -X GET http://localhost:3000/api/v1/subscriptions/usage \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 8. Set Up Test Users in Google Play Console

For testing purchases without being charged:

1. Go to Google Play Console → **Setup** → **License testing**
2. Add test Gmail accounts
3. These accounts can make test purchases without being charged

## 9. Production Deployment Checklist

- [ ] Service account JSON key is securely stored (not in version control)
- [ ] Environment variables are set correctly
- [ ] Database migrations have been run
- [ ] Google Play API is enabled
- [ ] Service account is linked to Google Play Console
- [ ] In-app products are created and activated
- [ ] `NODE_ENV=production` is set (to disable dev mode purchase bypass)
- [ ] SSL/HTTPS is enabled
- [ ] Rate limiting is configured
- [ ] Monitoring/logging is set up for purchase transactions

## 10. Troubleshooting

### Error: "Cannot find module 'googleapis'"

**Solution:** Run `npm install googleapis`

### Error: "Service account not found"

**Solution:** 
- Check that `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY` path is correct
- Ensure the file exists and is readable
- Verify the JSON file is valid

### Error: "Purchase verification failed"

**Solution:**
- Verify Google Play Developer API is enabled
- Check that service account has proper permissions
- Ensure product ID exists in Google Play Console
- Verify the transaction ID is valid and from a real purchase

### Error: "dailyAdLimitReached"

**Solution:** This is expected behavior. User has watched maximum ads for the day.

### Error: "adCooldownActive"

**Solution:** This is expected behavior. User must wait 5 minutes between ads.

### Error: "transactionAlreadyProcessed"

**Solution:** This is expected behavior to prevent double-crediting. The purchase was already processed.

## 11. Security Recommendations

1. **Never commit** the service account JSON key to version control
2. Set proper file permissions on the service account key (600)
3. Use environment variables for all secrets
4. Enable HTTPS in production
5. Implement rate limiting on ad reward endpoint
6. Monitor for suspicious activity in `mobile_purchases` table
7. Regularly rotate API keys
8. Set up alerts for failed verification attempts

## 12. Monitoring

Consider monitoring:
- Number of ad rewards granted per day
- Number of purchases verified per day
- Failed verification attempts
- Average credits per user
- Revenue from IAP

## Support

For issues or questions, refer to:
- [Documentation](./docs/MOBILE_IAP_ADS_SETUP.md)
- [Google Play Developer API Docs](https://developers.google.com/android-publisher)

