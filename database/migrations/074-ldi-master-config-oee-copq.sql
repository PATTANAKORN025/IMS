-- ══════════════════════════════════════════════════════════════
-- Migration 074: ldi_master_config (OEE & COPQ Parameters)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ldi_master_config (
    eqp_id VARCHAR(50) PRIMARY KEY,
    ideal_cycle_sec NUMERIC(10,2) NOT NULL DEFAULT 30.00,
    downtime_cost_per_min NUMERIC(10,2) NOT NULL DEFAULT 250.00,
    scrap_cost_per_board NUMERIC(10,2) NOT NULL DEFAULT 150.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed mock data for development
INSERT INTO public.ldi_master_config (eqp_id, ideal_cycle_sec, downtime_cost_per_min, scrap_cost_per_board)
VALUES 
    ('LDI-01', 30.00, 250.00, 150.00),
    ('LDI-02', 28.50, 220.00, 150.00),
    ('LDI-03', 32.00, 280.00, 150.00),
    ('LDI-04', 30.00, 250.00, 150.00),
    ('LDI-05', 29.00, 240.00, 150.00),
    ('LDI-06', 31.50, 260.00, 150.00),
    ('LDI-07', 30.00, 250.00, 150.00),
    ('LDI-08', 30.00, 250.00, 150.00),
    ('LDI-09', 28.00, 210.00, 150.00),
    ('LDI-10', 33.00, 300.00, 150.00)
ON CONFLICT (eqp_id) DO UPDATE SET
    ideal_cycle_sec = EXCLUDED.ideal_cycle_sec,
    downtime_cost_per_min = EXCLUDED.downtime_cost_per_min,
    scrap_cost_per_board = EXCLUDED.scrap_cost_per_board,
    updated_at = NOW();
