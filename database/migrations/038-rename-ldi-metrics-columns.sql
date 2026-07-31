-- Migration 038: Rename ldi_metrics columns to match ldi_data standard
-- This ensures the SRE AIOps Parser and Grafana dashboards work correctly.

ALTER TABLE public.ldi_metrics RENAME COLUMN pressure TO pe_1;
ALTER TABLE public.ldi_metrics RENAME COLUMN joule_effect TO je_1;
