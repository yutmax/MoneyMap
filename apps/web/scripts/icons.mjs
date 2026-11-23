import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Исходник иконок приложения.
 *
 * Рисунок один — монограмма M, — вариантов два, и отличаются они только
 * подложкой:
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

/** Цвета — те же токены, что и в интерфейсе (_tokens.scss, тёмная тема). */
const ACCENT = '#c6f24e';
const INK = '#111214';

/**
 * Монограмма M одной линией — как график, который идёт вниз и снова вверх.
 *
 * Та же фигура, что у марки в боковой панели (shared/ui/Logo), только в
 * поле 512 вместо 32: координаты умножены на 16. Скругление концов и углов
 * — чтобы в 16 px вкладки буква не рассыпалась на острые зубцы.
 *
 * Для maskable важно, что вся буква лежит в «безопасном круге» Android
 * (80% ширины от центра): самая дальняя её точка — угол на (128, 160)
 * плюс половина толщины линии, около 184 px от центра при допустимых 205.
 */
const M = 'M128 368V160l128 128 128-128v208';
const STROKE = 48;

function svg({ radius, size = 512 }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="512" height="512" rx="${radius}" fill="${ACCENT}" />
  <path
    d="${M}"
    fill="none"
    stroke="${INK}"
    stroke-width="${STROKE}"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
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
