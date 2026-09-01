# Render & Neon Setup Guide

This branch is configured to deploy on **Render** (free hosting) with **Neon** (free PostgreSQL database).

## Prerequisites

- Render account (https://render.com)
- Neon account (https://neon.tech)
- This GitHub repository connected to your Render account

## Step 1: Get Your Neon Connection String

Your Neon database is already set up with:
- **Username**: `ali@themoirs.co.uk`
- **Host**: `pg.neon.tech`
- **Database**: `neondb`

1. Go to https://console.neon.tech
2. Click on your project
3. Find the connection string and copy the **Pooling Connection String**
4. It should look like: `postgresql://ali@themoirs.co.uk:PASSWORD@pg.neon.tech/neondb?sslmode=require`

## Step 2: Deploy on Render

1. Go to https://render.com and sign in with GitHub
2. Click **New +** → **Web Service**
3. Select this repository (`TheMoirs/BTM`)
4. Configure:
   - **Name**: `btm-app` (or your preferred name)
   - **Runtime**: Node
   - **Build Command**: `npm run build`
   - **Start Command**: `npm run start`
   - **Plan**: Free

## Step 3: Set Environment Variables on Render

Add these environment variables in the Render dashboard:

### Required Variables

- **DATABASE_URL**: Paste the Neon pooling connection string from Step 1
  - Example: `postgresql://ali@themoirs.co.uk:PASSWORD@pg.neon.tech/neondb?sslmode=require`
- **NODE_ENV**: `production`

### Clerk Variables (if using authentication)

- **CLERK_SECRET_KEY**: Your Clerk secret key
- **CLERK_PUBLISHABLE_KEY**: Your Clerk publishable key
- **VITE_CLERK_PUBLISHABLE_KEY**: Same as `CLERK_PUBLISHABLE_KEY`

### Other Variables

Add any other environment variables your app needs (Resend API key, GitHub tokens, etc.)

## Step 4: Deploy

1. Render will automatically deploy when you push to your repository
2. Check deployment logs in the Render dashboard
3. Once deployed, your app will be available at `https://your-app-name.onrender.com`

## Database Migrations

Render will run `npm run build` which includes database schema setup.

If you need to manually run migrations:

```bash
DATABASE_URL="your-neon-connection-string" npm run db:push
```

## Important Notes

- **Free Tier Limits**:
  - Render free tier: Auto-spins down after 15 minutes of inactivity
  - Neon free tier: Includes 0.5 GB compute and 3 GB storage
  
- **Connection String Format**: Always use the **Pooling** connection string from Neon (not the direct connection URL)

- **SSL Required**: Neon requires SSL connections. The connection string includes `?sslmode=require` by default

- **Security**: Never commit your actual password to the repository. Use Render's environment variable dashboard instead.

## Updating the Code

Simply push changes to your main branch, and Render will automatically redeploy.

## Troubleshooting

- **Database connection failed**: 
  - Verify your `DATABASE_URL` is correct in Render's environment variables
  - Check that you're using the **Pooling** connection string, not the direct URL
  
- **Build fails**: Check the Render deployment logs for specific errors
  
- **App spins down**: This is normal on free tier after 15 minutes of inactivity; it will spin back up when accessed

## Local Development

To test locally with Neon:

```bash
# Create a .env file (DO NOT commit this)
DATABASE_URL="postgresql://ali@themoirs.co.uk:PASSWORD@pg.neon.tech/neondb?sslmode=require"

npm run dev
```

Make sure your `.env` file is in `.gitignore` to avoid committing secrets!
