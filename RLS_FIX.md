# RLS (Row Level Security) Issue - PERMANENT FIX

## 📝 POST-MORTEM: The "Double Lock" Problem

### 1. The Core Problem: Hidden Dependencies

The reason uploads fail is that **Storage** and **Database** are **two different systems** that share the same error message.

**Database Lock:**
- When you `DROP TABLE auras`, all its RLS Policies are deleted too
- When recreated, the table is locked by default
- You must re-apply policies after `DROP`

**Storage Lock:**
- Even if the database is open, the **Storage Bucket** (`aura-images`) needs its own policies
- Service role key should bypass RLS, but sometimes policies still block uploads
- Missing storage policies throw the same "RLS violation" error

**The Confusion:**
Both systems throw `new row violates row-level security policy`. You might be looking at the Table, but the error is actually coming from the **Storage upload step**.

### 🛠 The "Golden Rules" for Next Time

**Rule #1: DROP kills Policies**
- Whenever you run `DROP TABLE`, you must immediately re-run your `CREATE POLICY` scripts
- The table and its permissions are a package deal
- If you only want to clear data: use `TRUNCATE TABLE` instead of `DROP`

**Rule #2: Check the "Upload Pipe" in order**
If an upload fails, identify exactly where it crashed:
1. **Storage Upload**: `supabase.storage.upload(...)` → Needs `storage.objects` policies
2. **Database Entry**: `supabase.rpc('insert_aura', ...)` → Needs `public.auras` policies

**Rule #3: Service Role Key doesn't always bypass RLS**
- In theory, service role key should bypass all RLS
- In practice, both Storage and Database can still block operations
- **For development**: Disable RLS completely on both
- **For production**: Create explicit policies

---

## THE PROBLEM
Error: `new row violates row-level security policy`

### Root Cause
This error appears in **TWO places**:

**1. Supabase Storage (Most Common)**
- The `aura-images` bucket has RLS enabled
- Missing upload policies on `storage.objects`
- Error happens during `.upload()` call
- Shows as: `StorageApiError: new row violates row-level security policy`

**2. Database Table**
- RLS enabled on `auras` table
- PostgreSQL function lacks `SECURITY DEFINER`
- Schema changes re-enable RLS
- Shows as: `RPC Error: new row violates row-level security policy`

## PERMANENT SOLUTION

### Step 1: Completely Disable RLS (Development)
Run this in **Supabase Dashboard → SQL Editor**:

```sql
-- Disable RLS on the table entirely
ALTER TABLE auras DISABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies to be safe
DROP POLICY IF EXISTS "Auras are public" ON auras;
DROP POLICY IF EXISTS "Users can create their own Auras" ON auras;
DROP POLICY IF EXISTS "Allow authenticated inserts" ON auras;
DROP POLICY IF EXISTS "Allow all inserts" ON auras;

-- Verify RLS is OFF
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'auras';
-- Should return: rowsecurity = false
```

### Step 2: Ensure Function Has SECURITY DEFINER
```sql
-- Drop and recreate with SECURITY DEFINER
DROP FUNCTION IF EXISTS insert_aura;

CREATE OR REPLACE FUNCTION insert_aura(
  p_user_id uuid,
  p_title text,
  p_image_urls text[],
  p_archetype_tag text,
  p_heading float,
  p_altitude float,
  p_lng float,
  p_lat float,
  p_is_verified boolean,
  p_description text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER  -- This is CRITICAL - bypasses RLS
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO auras (
    user_id,
    title,
    image_urls,
    archetype_tag,
    heading,
    altitude,
    location,
    is_verified,
    description
  )
  VALUES (
    p_user_id,
    p_title,
    p_image_urls,
    p_archetype_tag,
    p_heading,
    p_altitude,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_is_verified,
    p_description
  );
END;
$$;
```

### Step 3: Verify Configuration
```sql
-- Check if RLS is disabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'auras';

-- Check if function exists with SECURITY DEFINER
SELECT proname, prosecdef
FROM pg_proc
WHERE proname = 'insert_aura';
-- prosecdef should be 't' (true)
```

## WHY THIS KEEPS HAPPENING

1. **Schema Changes**: When you run `ALTER TABLE ADD COLUMN`, PostgreSQL may re-check or re-apply security settings
2. **Policy Conflicts**: Multiple policies can interfere with each other
3. **Supabase Dashboard**: The Supabase UI might auto-enable RLS when you modify tables

## PREVENTION CHECKLIST

✅ **Before ANY schema change:**
```sql
-- Always run this FIRST
ALTER TABLE auras DISABLE ROW LEVEL SECURITY;
```

✅ **After creating new columns:**
```sql
-- Run this AGAIN after schema changes
ALTER TABLE auras DISABLE ROW LEVEL SECURITY;
```

✅ **After creating/updating functions:**
```sql
-- Verify the function has SECURITY DEFINER
SELECT proname, prosecdef FROM pg_proc WHERE proname = 'insert_aura';
```

## COMPLETE SETUP SCRIPT (Run This Now)

Copy and paste this entire block into Supabase SQL Editor:

```sql
-- ==================================================
-- COMPLETE RLS FIX FOR AURA TABLE
-- Run this entire block as one transaction
-- ==================================================

-- 1. Ensure columns exist
ALTER TABLE auras ADD COLUMN IF NOT EXISTS image_urls text[];
ALTER TABLE auras ADD COLUMN IF NOT EXISTS description text;

-- 2. DISABLE RLS COMPLETELY
ALTER TABLE auras DISABLE ROW LEVEL SECURITY;

-- 3. Drop ALL policies
DROP POLICY IF EXISTS "Auras are public" ON auras;
DROP POLICY IF EXISTS "Users can create their own Auras" ON auras;
DROP POLICY IF EXISTS "Allow authenticated inserts" ON auras;
DROP POLICY IF EXISTS "Allow all inserts" ON auras;

-- 4. Recreate the insert function with SECURITY DEFINER
DROP FUNCTION IF EXISTS insert_aura;

CREATE OR REPLACE FUNCTION insert_aura(
  p_user_id uuid,
  p_title text,
  p_image_urls text[],
  p_archetype_tag text,
  p_heading float,
  p_altitude float,
  p_lng float,
  p_lat float,
  p_is_verified boolean,
  p_description text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO auras (
    user_id,
    title,
    image_urls,
    archetype_tag,
    heading,
    altitude,
    location,
    is_verified,
    description
  )
  VALUES (
    p_user_id,
    p_title,
    p_image_urls,
    p_archetype_tag,
    p_heading,
    p_altitude,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_is_verified,
    p_description
  );
END;
$$;

-- 5. Verify everything is correct
SELECT 'RLS Status:' as check_type,
       CASE WHEN rowsecurity THEN 'ENABLED (BAD!)' ELSE 'DISABLED (GOOD!)' END as status
FROM pg_tables
WHERE tablename = 'auras';

SELECT 'Function Security:' as check_type,
       CASE WHEN prosecdef THEN 'SECURITY DEFINER (GOOD!)' ELSE 'NOT DEFINER (BAD!)' END as status
FROM pg_proc
WHERE proname = 'insert_aura';
```

## FOR PRODUCTION

When you deploy to production, you'll want to re-enable RLS with proper policies:

```sql
-- Enable RLS
ALTER TABLE auras ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read
CREATE POLICY "Public read access" ON auras
  FOR SELECT
  USING (true);

-- Allow service role to insert (backend)
CREATE POLICY "Service role insert" ON auras
  FOR INSERT
  WITH CHECK (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    OR auth.uid() = user_id
  );
```

But for now, keep it disabled for development.

## SUMMARY

**THE FIX:**
1. Run the complete setup script above
2. Verify RLS shows as "DISABLED"
3. Verify function shows as "SECURITY DEFINER"
4. Test upload - it should work now

**NEVER DO THIS AGAIN:**
- Don't manually enable RLS in Supabase dashboard
- Don't create new policies without disabling RLS first
- Always run `ALTER TABLE auras DISABLE ROW LEVEL SECURITY;` after schema changes

---

## 🔧 THE "MAGIC SCRIPT" - Complete Reset (Keep This!)

Use this when you need to completely reset or set up fresh. Run the entire block at once:

```sql
/* ================================================================
   THE RESET CHECKLIST
   1. Create Tables
   2. Create Functions
   3. Enable RLS (for production) OR Disable (for development)
   4. Create Policies (Table AND Storage)
   ================================================================ */

-- ============================================================
-- A. THE TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.auras (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  title text,
  image_urls text[],
  archetype_tag text,
  heading float,
  altitude float,
  location geography(POINT, 4326),
  is_verified boolean DEFAULT true,
  description text
);

-- FOR DEVELOPMENT: Disable RLS
ALTER TABLE public.auras DISABLE ROW LEVEL SECURITY;

-- FOR PRODUCTION: Enable RLS and add policies
-- ALTER TABLE public.auras ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- B. THE TABLE POLICIES (Production Only)
-- ============================================================
-- Uncomment for production:
/*
CREATE POLICY "Allow Auth Insert" ON public.auras
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow Public Read" ON public.auras
  FOR SELECT TO public
  USING (true);
*/

-- ============================================================
-- C. THE STORAGE POLICIES (Often Forgotten!)
-- ============================================================
-- FOR DEVELOPMENT: Disable Storage RLS
-- Note: You may not have permission via SQL - use Supabase Dashboard UI instead

-- FOR PRODUCTION: Create storage policies via Supabase Dashboard UI:
-- 1. Go to Storage → aura-images → Policies
-- 2. Add policy: "Allow authenticated users to upload"
--    - Policy name: "Allow Auth Upload"
--    - Allowed operation: INSERT
--    - Target roles: authenticated
--    - WITH CHECK: bucket_id = 'aura-images'
-- 3. Add policy: "Allow public to view images"
--    - Policy name: "Allow Public Read"
--    - Allowed operation: SELECT
--    - Target roles: public
--    - USING: bucket_id = 'aura-images'

-- ============================================================
-- D. THE INSERT FUNCTION (with SECURITY DEFINER)
-- ============================================================
DROP FUNCTION IF EXISTS insert_aura;

CREATE OR REPLACE FUNCTION insert_aura(
  p_user_id uuid,
  p_title text,
  p_image_urls text[],
  p_archetype_tag text,
  p_heading float,
  p_altitude float,
  p_lng float,
  p_lat float,
  p_is_verified boolean,
  p_description text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER  -- Bypasses RLS
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO auras (
    user_id, title, image_urls, archetype_tag,
    heading, altitude, location, is_verified, description
  )
  VALUES (
    p_user_id, p_title, p_image_urls, p_archetype_tag,
    p_heading, p_altitude,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_is_verified, p_description
  );
END;
$$;

-- ============================================================
-- E. VERIFICATION
-- ============================================================
SELECT 'Table RLS Status:' as check,
       CASE WHEN rowsecurity THEN 'ENABLED' ELSE 'DISABLED' END as status
FROM pg_tables WHERE tablename = 'auras';

SELECT 'Function Security:' as check,
       CASE WHEN prosecdef THEN 'SECURITY DEFINER (GOOD)' ELSE 'INVOKER (BAD)' END as status
FROM pg_proc WHERE proname = 'insert_aura';

-- Storage RLS check (if you have permission)
SELECT 'Storage RLS Status:' as check,
       CASE WHEN rowsecurity THEN 'ENABLED' ELSE 'DISABLED' END as status
FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects';
```

---

## 💡 Debugging Tips

**When you see "RLS Violation", check your Node.js terminal logs:**

**If the log shows:**
- `StorageApiError` or `storage-js` in stack trace → **Storage bucket policy issue**
- `RPC Error` or database error → **Table policy or function signature issue**

**Quick diagnostic:**
```javascript
// In your upload route, the error happens at:
const { error } = await supabase.storage.upload(...)  // ← Storage RLS
// OR
const { error } = await supabase.rpc('insert_aura', ...) // ← Database RLS
```

**Check which line throws the error:**
- Line 1 fails = Storage RLS problem → Fix bucket policies
- Line 2 fails = Database RLS problem → Fix table policies or function

---

## 🎯 FOR DEVELOPMENT (Quick Fix)

**Disable everything via Supabase Dashboard UI:**

1. **Storage**:
   - Go to Storage → aura-images bucket
   - Toggle OFF "Enable RLS"

2. **Database**:
   - Already handled by the SQL script above

**This gives you a working development environment with no security blocking you.**

---

## 🔒 FOR PRODUCTION (Secure Setup)

When deploying to production, re-enable RLS and create proper policies:

**Database Policies:**
```sql
ALTER TABLE auras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read auras"
  ON auras FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own auras"
  ON auras FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

**Storage Policies** (via Dashboard UI):
- Allow authenticated users to upload to their own folder
- Allow public to read all images

**Function** keeps `SECURITY DEFINER` - this is safe because your backend validates the user before calling it.
