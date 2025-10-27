-- Seed de productos alineado al nuevo esquema de la tabla product.
-- Se asume que existen las categorias:
--   1 Tecnologia & Tablets
--   2 Moda Mujer
--   3 Relojes & Accesorios
--   4 Belleza & Cuidado
--   5 Hogar & Decoracion
--   6 Gadgets & Smart Home
--
-- El script utiliza ON CONFLICT (slug) para permitir una ejecucion idempotente.

INSERT INTO product (
  slug,
  name,
  brand,
  description,
  picture,
  price,
  money,
  stock,
  "new",
  badge,
  segments,
  features,
  related_ids,
  id_category
)
VALUES
  (
    'samsung-galaxy-s22-graphite',
    'Maletin Travel Graphite',
    'Samsung',
    'Maletin organizador en lona azul con cremalleras contrastantes. Protege laptop y accesorios en viajes de trabajo o estudio.',
    'https://static.classyshop.pe/products/maletin-travel-graphite.jpg',
    289.00,
    'PEN',
    18,
    false,
    '{"label":"Mas comprado","tone":"primary"}'::jsonb,
    ARRAY['best-sellers','seleccion-destacada','viajes'],
    ARRAY[
      'Compartimiento acolchado para laptop 15"',
      'Bolsillos frontales con cierre waterproof',
      'Asa lateral y correa removible acolchada'
    ],
    ARRAY[2,4,11]::bigint[],
    3
  ),
  (
    'sillon-lounge-arena',
    'Sillon Lounge Arena',
    'Urban Living',
    'Sillon lounge tapizado en tono arena con base metalica giratoria. Ideal para sala o estudio gracias a su diseno ergonomico.',
    'https://static.classyshop.pe/products/sillon-lounge-arena.jpg',
    229.00,
    'PEN',
    26,
    false,
    '{"label":"Mas comprado","tone":"primary"}'::jsonb,
    ARRAY['best-sellers','seleccion-destacada','hogar'],
    ARRAY[
      'Tapizado en lona repelente',
      'Base de acero giratoria 360',
      'Incluye cojines desmontables'
    ],
    ARRAY[1,6,9]::bigint[],
    5
  ),
  (
    'audifonos-wave-blue',
    'Bolso Tote Turquesa City',
    'City Chic',
    'Bolso tote en ecocuero turquesa con herrajes metalicos dorados y charm desmontable para el dia a dia.',
    'https://static.classyshop.pe/products/bolso-tote-turquesa-city.jpg',
    319.00,
    'PEN',
    32,
    false,
    '{"label":"Mas comprado","tone":"primary"}'::jsonb,
    ARRAY['best-sellers','seleccion-destacada','moda'],
    ARRAY[
      'Forro interno resistente a manchas',
      'Bolsillo interior con cierre y porta llaves',
      'Incluye correa larga regulable y charm metalico'
    ],
    ARRAY[2,7,12]::bigint[],
    2
  ),
  (
    'maletin-soft-rosa',
    'Beauty Case Soft Rose Carry-On',
    'Urban Glow',
    'Beauty case de cabina tono rosa pastel con exterior water resistant y compartimientos acolchados para skincare.',
    'https://static.classyshop.pe/products/beauty-case-soft-rose.jpg',
    389.00,
    'PEN',
    14,
    false,
    '{"label":"Mas comprado","tone":"primary"}'::jsonb,
    ARRAY['best-sellers','cuidado-personal'],
    ARRAY[
      'Exterior resistente al agua y golpes leves',
      'Bandas elasticas internas para frascos',
      'Incluye compartimiento removible para maquillaje'
    ],
    ARRAY[1,2,6]::bigint[],
    4
  ),
  (
    'purificador-aircare-pure',
    'Purificador Facial AirCare Pure',
    'AirCare',
    'Dispositivo de vapor facial con tecnologia ionica para rutinas de limpieza y spa en casa.',
    'https://static.classyshop.pe/products/purificador-facial-aircare-pure.jpg',
    189.00,
    'PEN',
    25,
    true,
    '{}'::jsonb,
    ARRAY['new-arrivals','cuidado-personal'],
    ARRAY[
      'Modo de vapor ionico con tres niveles',
      'Tanque de 180 ml desmontable',
      'Apagado automatico por falta de agua'
    ],
    ARRAY[2,6,10]::bigint[],
    4
  ),
  (
    'set-organizador-gourmet',
    'Poncho Knit Taupe',
    'SoftWeave',
    'Poncho ligero tejido en punto fino color taupe para complementar outfits de media estacion.',
    'https://static.classyshop.pe/products/poncho-knit-taupe.jpg',
    239.00,
    'PEN',
    34,
    true,
    '{}'::jsonb,
    ARRAY['new-arrivals','moda'],
    ARRAY[
      'Tejido hipoalergenico mezcla viscosa y algodon',
      'Terminaciones con costura invisible y cuello barco',
      'Lavado a mano o ciclo delicado, secado en plano'
    ],
    ARRAY[2,5,10]::bigint[],
    2
  ),
  (
    'bolso-city-taupe',
    'Reloj Loft Leather 40mm',
    'Nordic Time',
    'Reloj analogico con correa de cuero marron y caratula minimalista de 40 mm para looks casuales o ejecutivos.',
    'https://static.classyshop.pe/products/reloj-loft-leather-40mm.jpg',
    369.00,
    'PEN',
    22,
    true,
    '{}'::jsonb,
    ARRAY['new-arrivals','seleccion-destacada'],
    ARRAY[
      'Movimiento de cuarzo japones',
      'Resistencia al agua 3 ATM',
      'Correa intercambiable con cierre clasico'
    ],
    ARRAY[2,8,9]::bigint[],
    3
  ),
  (
    'kit-glow-skin-advanced',
    'Camara 360 PureGlow Orbit',
    'PureGlow',
    'Camara panoramica 4K con soporte tripode integrado que sincroniza con smartphone para capturar contenido inmersivo.',
    'https://static.classyshop.pe/products/camara-360-pureglow-orbit.jpg',
    899.00,
    'PEN',
    30,
    true,
    '{}'::jsonb,
    ARRAY['new-arrivals','tecnologia'],
    ARRAY[
      'Video 4K 360 con estabilizacion',
      'Wi-Fi y Bluetooth para transmision en vivo',
      'Bateria intercambiable hasta 90 minutos'
    ],
    ARRAY[7,9,12]::bigint[],
    1
  ),
  (
    'organizador-modular-desk',
    'Organizador Modular Desk',
    'Orderly',
    'Sistema modular para escritorio con bandeja para dispositivos, portalapices y separadores ajustables.',
    'https://static.classyshop.pe/products/organizador-modular-desk.jpg',
    189.00,
    'PEN',
    42,
    false,
    '{}'::jsonb,
    ARRAY['catalogo','oficina'],
    ARRAY[
      'Base antideslizante en silicona',
      'Modulos imantados intercambiables',
      'Canal oculto para gestion de cables'
    ],
    ARRAY[2,7,11]::bigint[],
    5
  ),
  (
    'cafetera-barista-smart',
    'Cafetera Barista Smart',
    'BrewMaster',
    'Cafetera automatica con molinillo ceramico integrado y control desde app para personalizar cada taza.',
    'https://static.classyshop.pe/products/cafetera-barista-smart.jpg',
    899.00,
    'PEN',
    18,
    false,
    '{}'::jsonb,
    ARRAY['catalogo','cocina'],
    ARRAY[
      '19 bares de presion con vaporizador profesional',
      'Reservorio de agua de 1.8 L',
      'Programas para espresso, latte y cold brew'
    ],
    ARRAY[5,6,12]::bigint[],
    6
  ),
  (
    'mouse-gamer-onyx-7200',
    'Mouse Gamer Onyx 7200',
    'Onyx Gear',
    'Mouse ergonomico con sensor optico de 7200 DPI, iluminacion RGB personalizable y memoria interna para perfiles.',
    'https://static.classyshop.pe/products/mouse-gamer-onyx-7200.jpg',
    259.00,
    'PEN',
    52,
    false,
    '{}'::jsonb,
    ARRAY['catalogo','gaming'],
    ARRAY[
      'Seis botones programables',
      'Software para macros y ajustes DPI',
      'Cable mallado de alta resistencia de 1.8 m'
    ],
    ARRAY[1,3,12]::bigint[],
    1
  ),
  (
    'parlante-pulse-mini',
    'Parlante Pulse Mini 360',
    'BeatBox',
    'Parlante portatil con sonido 360, resistencia al agua IPX6 y 20 horas de autonomia para uso en exteriores.',
    'https://static.classyshop.pe/products/parlante-pulse-mini-360.jpg',
    349.00,
    'PEN',
    34,
    false,
    '{}'::jsonb,
    ARRAY['catalogo','audio'],
    ARRAY[
      'Conexion Bluetooth 5.2 y modo party link',
      'Microfono integrado con cancelacion de eco',
      'Puerto USB-C para carga rapida'
    ],
    ARRAY[3,7,11]::bigint[],
    6
  )
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  brand = EXCLUDED.brand,
  description = EXCLUDED.description,
  picture = EXCLUDED.picture,
  price = EXCLUDED.price,
  money = EXCLUDED.money,
  stock = EXCLUDED.stock,
  "new" = EXCLUDED."new",
  badge = EXCLUDED.badge,
  segments = EXCLUDED.segments,
  features = EXCLUDED.features,
  related_ids = EXCLUDED.related_ids,
  id_category = EXCLUDED.id_category;

