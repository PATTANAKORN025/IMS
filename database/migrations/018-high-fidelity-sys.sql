-- ══════════════════════════════════════════════════════════════
-- Migration 018: High-Fidelity JSONB Columns for sys_metrics
-- Zero-downtime: old columns (cpu_load_percent, temp_c) kept for
-- backward compatibility. New JSONB columns store per-core/sensor data.
-- ══════════════════════════════════════════════════════════════

-- Add cpu_metrics JSONB for per-core CPU data (e.g., {"core_1": 18, "core_2": 22})
DO $$ BEGIN
    ALTER TABLE public.sys_metrics ADD COLUMN IF NOT EXISTS cpu_metrics JSONB DEFAULT '{}'::jsonb;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add temp_metrics JSONB for per-sensor temperature data (e.g., {"sensor_1": 37, "sensor_2": 33})
DO $$ BEGIN
    ALTER TABLE public.sys_metrics ADD COLUMN IF NOT EXISTS temp_metrics JSONB DEFAULT '{}'::jsonb;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add GIN index on cpu_metrics for efficient JSONB queries (per-core Grafana panels)
CREATE INDEX IF NOT EXISTS idx_sys_cpu_metrics ON public.sys_metrics USING gin(cpu_metrics);

-- Add GIN index on temp_metrics for efficient JSONB queries (per-sensor Grafana panels)
CREATE INDEX IF NOT EXISTS idx_sys_temp_metrics ON public.sys_metrics USING gin(temp_metrics);

-- Backfill existing rows: populate cpu_metrics and temp_metrics from legacy columns
-- This ensures historical data is queryable via JSONB from day one
DO $$ BEGIN
    UPDATE public.sys_metrics
    SET cpu_metrics = jsonb_build_object('avg', cpu_load_percent)
    WHERE cpu_metrics = '{}'::jsonb AND cpu_load_percent IS NOT NULL;

    UPDATE public.sys_metrics
    SET temp_metrics = jsonb_build_object('sensor_1', temp_c)
    WHERE temp_metrics = '{}'::jsonb AND temp_c > 0;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
