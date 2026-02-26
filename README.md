# Aura Backend

Aura Backend is the API layer powering the Aura platform. It handles data processing, authentication logic, and communication with Supabase (PostgreSQL + PostGIS) to support geo-based features and user interactions.

## Tech Stack

* Node.js
* TypeScript
* Express
* Supabase
* Zod
* dotenv

## Purpose

The backend is responsible for:

* Managing Aura posts (geo-tagged logs)
* Handling spatial queries (bounding box, nearby)
* Managing saves and verifications
* Securing server-side keys and logic
* Serving clean REST endpoints to the frontend

## Development

Install dependencies and run the development server. The API runs locally on port 5000 by default.

## Environment Variables

Required:

* PORT
* SUPABASE_URL
* SUPABASE_SERVICE_ROLE_KEY

Environment variables must never be committed.

## Project Structure

* src/index.ts — Server entry
* src/routes — API route definitions
* src/controllers — Request handlers
* src/lib — Shared utilities (Supabase client, helpers)
* src/types — Shared TypeScript types

## Status

MVP phase. Core endpoints and geo queries are under active development.

## Ownership

All code and intellectual property belong to the Aura project entity.
