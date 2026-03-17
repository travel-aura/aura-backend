#!/bin/bash

# Aura Backend - Cloud Run Deployment Script
# Make sure you have gcloud CLI installed and authenticated

# Set variables
PROJECT_ID="aura-489317"
REGION="us-central1"
SERVICE_NAME="aura-backend"

# Build and deploy to Cloud Run
gcloud run deploy $SERVICE_NAME \
  --source . \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars "SUPABASE_URL=$SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY,CORS_ORIGIN=https://aura-frontend-255644230597.us-central1.run.app"

echo "Deployment complete!"
echo "Your backend URL will be shown above"
