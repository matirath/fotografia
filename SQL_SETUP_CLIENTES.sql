-- SQL de setup para la tabla actual 'archivo_clientes' en Supabase
-- Ejecuta este bloque en el SQL Editor de tu proyecto

ALTER TABLE public.archivo_clientes
ADD COLUMN IF NOT EXISTS carpeta TEXT;

ALTER TABLE public.archivo_clientes
ADD COLUMN IF NOT EXISTS hero_img TEXT DEFAULT '';

ALTER TABLE public.archivo_clientes
ADD COLUMN IF NOT EXISTS tipo_entrega TEXT DEFAULT 'evento';

UPDATE public.archivo_clientes
SET tipo_entrega = 'evento'
WHERE tipo_entrega IS NULL OR btrim(tipo_entrega) = '';

-- Ajustes iniciales de clientes existentes
UPDATE public.archivo_clientes
SET hero_img = 'imgs/mutuo-portada.jpg',
    tipo_entrega = 'evento',
    carpeta = COALESCE(NULLIF(carpeta, ''), 'mutuo-inauguracion')
WHERE clave_tecnica = 'mutuo-inag-26';

UPDATE public.archivo_clientes
SET tipo_entrega = 'evento'
WHERE clave_tecnica = 'geraldine27';

-- Ejemplo de alta / actualización de cliente evento
INSERT INTO public.archivo_clientes (
  clave_tecnica,
  cliente_nombre,
  evento_detalles,
  carpeta,
  hero_img,
  tipo_entrega
) VALUES (
  'mutuo-inag-26',
  'Mutuo',
  'Inauguración 2026',
  'mutuo-inauguracion',
  'imgs/mutuo-portada.jpg',
  'evento'
)
ON CONFLICT (clave_tecnica) DO UPDATE SET
  cliente_nombre = EXCLUDED.cliente_nombre,
  evento_detalles = EXCLUDED.evento_detalles,
  carpeta = EXCLUDED.carpeta,
  hero_img = EXCLUDED.hero_img,
  tipo_entrega = EXCLUDED.tipo_entrega;

-- Ejemplo de alta / actualización de cliente marca
INSERT INTO public.archivo_clientes (
  clave_tecnica,
  cliente_nombre,
  evento_detalles,
  carpeta,
  hero_img,
  tipo_entrega
) VALUES (
  'marca-demo-26',
  'Marca Demo',
  'Campaña otoño 2026',
  'marca-demo-otono',
  'imgs/marca-demo-portada.jpg',
  'marca'
)
ON CONFLICT (clave_tecnica) DO UPDATE SET
  cliente_nombre = EXCLUDED.cliente_nombre,
  evento_detalles = EXCLUDED.evento_detalles,
  carpeta = EXCLUDED.carpeta,
  hero_img = EXCLUDED.hero_img,
  tipo_entrega = EXCLUDED.tipo_entrega;

-- Consultas útiles de control
SELECT clave_tecnica, cliente_nombre, tipo_entrega, carpeta, hero_img
FROM public.archivo_clientes
ORDER BY created_at DESC NULLS LAST, cliente_nombre ASC;
