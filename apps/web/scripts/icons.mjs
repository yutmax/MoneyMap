import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Исходник иконок приложения.
 *
 * Рисунок один, вариантов три, и отличаются они только подложкой:
 *
 *  - favicon.svg        — скруглённый квадрат: вкладка браузера, и он же
 *                         исходник PNG «обычного» назначения;
 *  - icon-maskable.svg  — во всю площадь, без скруглений.
 *
 * Maskable нужен отдельным файлом, потому что Android накладывает на иконку
 * свою маску — круг, скруглённый квадрат или что решит прошивка. Скруглённая
 * картинка под такой маской получает вторую рамку, а прозрачные углы в
 * нескруглённой маске светятся дырами. Поэтому у maskable подложка во всю
 * площадь, а метка целиком помещается в «безопасный круг» — 80% ширины
 * от центра, всё за его пределами прошивка вправе срезать.
 *
 * PNG из этих файлов лежат рядом в public/ и в git. Пересобрать их можно
 * браузером: нарисовать SVG в canvas нужного размера и сохранить toDataURL —
 * ровно так они и сделаны, без добавления в проект растеризатора ради
 * картинок, которые меняются раз в жизни.
 */

/** Цвета — те же токены, что и в интерфейсе (_tokens.scss). */
const ACCENT = '#c0e24a';
const INK = '#1b1c1a';

/**
 * Метка на карте: голова — окружность радиуса 116 с центром (256, 206),
 * от неё две кривые сходятся в остриё на (256, 404). Центр головы смещён
 * вверх от центра холста, потому что зрительно метка «стоит» на острие,
 * и симметричное размещение выглядит съехавшим вниз.
 */
const PIN = 'M256 404C256 404 140 300 140 206a116 116 0 1 1 232 0c0 94-116 198-116 198Z';

/**
 * Дороги под меткой — чтобы подложка читалась как карта, а не просто как
 * зелёный квадрат. Линии уходят за край холста: обрезанная дорога выглядит
 * продолжающейся, а начатая и законченная внутри — царапиной.
 */
const ROADS = ['M-40 556 552 330', 'M-40 330 552 556'];

/** Стрелка роста внутри метки: lucide/trending-up в своих координатах 24×24. */
const ARROW = ['M22 7 13.5 15.5 8.5 10.5 2 17', 'M16 7h6v6'];

function svg({ radius, size = 512 }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <clipPath id="plate">
      <rect width="512" height="512" rx="${radius}" />
    </clipPath>
  </defs>

  <rect width="512" height="512" rx="${radius}" fill="${ACCENT}" />

  <g clip-path="url(#plate)" fill="none" stroke="#ffffff" stroke-width="44">
${ROADS.map((d) => `    <path d="${d}" />`).join('\n')}
  </g>

  <path d="${PIN}" fill="${INK}" />
  <circle cx="256" cy="206" r="70" fill="#ffffff" />

  <g
    transform="translate(256 206) scale(4.4) translate(-12 -12)"
    fill="none"
    stroke="${INK}"
    stroke-width="2.4"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
${ARROW.map((d) => `    <path d="${d}" />`).join('\n')}
  </g>
</svg>
`;
}

/** Скругление подложки: 22% стороны — пропорция иконок iOS и Android. */
const ROUNDED = 112;

const out = fileURLToPath(new URL('../public/', import.meta.url));
const files = {
  'favicon.svg': svg({ radius: ROUNDED }),
  'icon-maskable.svg': svg({ radius: 0 }),
};

for (const [name, content] of Object.entries(files)) {
  writeFileSync(out + name, content);
  console.log(`${name} — ${content.length} байт`);
}

/**
 * favicon.ico — тот же PNG 32×32, упакованный в контейнер ICO.
 *
 * Нужен не браузерам (им хватает SVG), а запросам к /favicon.ico, которые
 * они шлют сами, не спрашивая разметку. Без файла такой запрос упирается
 * в try_files Caddy и получает index.html — HTML вместо картинки.
 *
 * Внутри лежит именно PNG, а не BMP: контейнер это допускает начиная
 * с Windows Vista, и собственный кодировщик растра ради иконки не нужен.
 */
const RASTER_32 = out + 'favicon-32.png';
if (existsSync(RASTER_32)) {
  const png = readFileSync(RASTER_32);
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // зарезервировано
  header.writeUInt16LE(1, 2); // 1 — иконка (2 было бы курсором)
  header.writeUInt16LE(1, 4); // одно изображение
  header.writeUInt8(32, 6); // ширина
  header.writeUInt8(32, 7); // высота
  header.writeUInt8(0, 8); // палитра не используется
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10); // плоскостей
  header.writeUInt16LE(32, 12); // бит на пиксель
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18); // смещение данных — сразу за заголовком
  writeFileSync(out + 'favicon.ico', Buffer.concat([header, png]));
  console.log(`favicon.ico — ${22 + png.length} байт`);
} else {
  console.log('favicon-32.png нет — favicon.ico не пересобран');
}
