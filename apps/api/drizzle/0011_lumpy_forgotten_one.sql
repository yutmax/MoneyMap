/*
 Категории становятся справочником (§8.4).

 Порядок такой. Сначала исчезают `name` и `icon`: обе NOT NULL или с данными,
 и пока они на месте, недостающую категорию набора не вставить, не выдумав ей
 название — то самое, от которого мы и уходим. Затем данные приводятся к
 новому виду. И только в конце `default_key` получает NOT NULL: раньше он упал
 бы на строках, которые эта же миграция и должна убрать.

 Каталог ниже выписан значениями, а не взят из кода. Миграция — снимок во
 времени: категория, добавленная в `category.catalog.ts` завтра, не должна
 менять то, что уже применено на чужой базе. Её привезёт следующая миграция
 или обычный вызов `createDefaultCategories`.
*/
ALTER TABLE "categories" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "categories" DROP COLUMN "icon";--> statement-breakpoint
insert into "categories" ("user_id", "kind", "default_key", "sort_order")
select u."id", c."kind"::"public"."category_kind", c."key", c."sort_order"
from "users" u
cross join (values
  ('salary',        'income',  10),
  ('sideIncome',    'income',  20),
  ('interest',      'income',  30),
  ('refunds',       'income',  40),
  ('giftsIn',       'income',  50),
  ('otherIncome',   'income',  60),
  ('groceries',     'expense',  70),
  ('eatingOut',     'expense',  80),
  ('transport',     'expense',  90),
  ('car',           'expense', 100),
  ('housing',       'expense', 110),
  ('utilities',     'expense', 120),
  ('connectivity',  'expense', 130),
  ('health',        'expense', 140),
  ('beauty',        'expense', 150),
  ('clothes',       'expense', 160),
  ('entertainment', 'expense', 170),
  ('sport',         'expense', 180),
  ('education',     'expense', 190),
  ('travel',        'expense', 200),
  ('pets',          'expense', 210),
  ('subscriptions', 'expense', 220),
  ('giftsOut',      'expense', 230),
  ('taxes',         'expense', 240),
  ('otherExpense',  'expense', 250)
) as c("key", "kind", "sort_order")
on conflict ("user_id", "default_key") do update
  set "kind" = excluded."kind",
      "sort_order" = excluded."sort_order",
      -- Удалённую когда-то категорию набора возвращаем: набор обязан быть
      -- полным, а завести её заново человеку больше нечем.
      "deleted_at" = null,
      "updated_at" = now();
--> statement-breakpoint
/*
 Операции и регулярные правила, висевшие на своих категориях, остаются без
 категории. Переносить их в «Прочие» мы не стали: что именно человек имел в
 виду своей категорией, мы не знаем, и подставить догадку значило бы выдать
 её за его выбор.
*/
update "transactions" set "category_id" = null, "updated_at" = now()
where "category_id" in (select "id" from "categories" where "default_key" is null);
--> statement-breakpoint
update "recurring_rules" set "category_id" = null, "updated_at" = now()
where "category_id" in (select "id" from "categories" where "default_key" is null);
--> statement-breakpoint
delete from "budgets"
where "category_id" in (select "id" from "categories" where "default_key" is null);
--> statement-breakpoint
-- Набор плоский, вложенности в нём нет: родитель снимается у всех.
update "categories" set "parent_id" = null, "updated_at" = now()
where "parent_id" is not null;
--> statement-breakpoint
delete from "categories" where "default_key" is null;
--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "default_key" SET NOT NULL;
