# Placas de Guía de Uso — Carrusel Automático

## Especificaciones técnicas

- **Ubicación**: `imgs/guia-uso/`
- **Formato**: JPG
- **Resolución**: 1920x1080 px (16:9) - Recomendado
- **Calidad**: 82-88 JPG
- **Perfil color**: sRGB
- **Safe area**: 8% margen exterior

## Placas esperadas (orden de rotación)

1. **matirath_01-acceso.jpg** — Tiempo lectura: 4.5s
2. **matirath_02-presentacion.jpg** — Tiempo lectura: 4.5s
3. **matirath_03-tramo-01.jpg** — Tiempo lectura: 4s
4. **matirath_04-tramo-02.jpg** — Tiempo lectura: 4s
5. **matirath_05-tramo-03.jpg** — Tiempo lectura: 4s
6. **matirath_06-seleccion.jpg** — Tiempo lectura: 4.5s
7. **matirath_07-soporte.jpg** — Tiempo lectura: 4.5s
8. **matirath_08-cierre.jpg** — Tiempo lectura: 4.5s

## Funcionalidades

- ✅ Rotación automática basada en tiempo de lectura
- ✅ Dial de navegación redondo (dots) abajo
- ✅ Barra de progreso visual
- ✅ Click en dots para saltar a cualquier placa
- ✅ Pausa automática cuando se cierra el modal
- ✅ Reinicio automático cuando se reabre

## Cómo ajustar tiempos de lectura

Edita el array `GUIDE_CAROUSEL_PLATES` en `archivo.html` (línea ~3485):

```javascript
const GUIDE_CAROUSEL_PLATES = [
  { name: 'matirath_01-acceso.jpg', readingTime: 4500 }, // ms
  // ... más placas
];
```

`readingTime` está en milisegundos (4500 = 4.5 segundos)

## Resolución de problemas

- Si las imágenes no se ven, verificar que están en `imgs/guia-uso/` con los nombres exactos
- Si el carrusel no rota, abrir consola (F12) y revisar errores de JavaScript
- El progreso solo se ve si hay espacio en el viewport (pantallas pequeñas pueden no mostrarlo)
