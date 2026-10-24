# メロンパン日記

スマホでメロンパンを記録・振り返りできる、React + TypeScript + Vite 製のPWAです。Supabase共有を設定すると、誰でも同じ記録を閲覧でき、投稿時に選択したアカウント名が表示されます。

## 起動・ビルド

Node.js 20以降とnpmを用意し、プロジェクト直下で実行します。

```bash
npm install
npm run dev
npm run build
npm run preview
```

## Supabase共有の準備

1. Supabaseでプロジェクトを作成します。
2. Supabase Dashboardの **SQL Editor** で `supabase-schema.sql` を実行します。共有用テーブル・アカウント一覧・公開写真bucketとRLSポリシーが作成されます。以前から使っている個人用テーブルと非公開写真bucketは変更しません。
3. 同じSQL Editorで利用者のアカウント名を登録します。名前ごとに1行実行します。

   ```sql
   insert into public.melonpan_accounts (name) values ('さくら');
   insert into public.melonpan_accounts (name) values ('たろう');
   ```

   アカウント一覧への登録・変更は管理者がSQL Editorから行います。新しいブラウザーセッションの開始時に表示されるボタンから利用アカウントを選びます。選択はタブのセッション中だけ記憶されます。
4. **Project Settings > API Keys** からProject URLとpublishable keyを取得します。secret keyやservice role keyはブラウザー側で使わないでください。
5. 開発時は `.env.example` を `.env.local` にコピーし、`VITE_SUPABASE_URL` は `https://<project-ref>.supabase.co` のようなProject URLだけにします。`/rest/v1`や`/storage/v1`は付けず、`VITE_SUPABASE_PUBLISHABLE_KEY`にはpublishable keyを設定します。
6. Vercelの **Project Settings > Environment Variables** に同じ2つの値を登録して再デプロイします。

### 公開範囲とアカウント選択について

この共有機能はログインや本人確認を行いません。アプリ画面では選択中アカウントの記録だけが一覧・集計に表示されます。記録・メモ・写真はインターネット上で誰でも閲覧でき、Supabaseの匿名APIから誰でも追加・変更・削除できます。画面では選択中アカウントの記録だけ編集・削除ボタンを受け付けますが、アカウント名は誰でも選択・詐称でき、APIを直接呼べばその制限も回避できます。個人情報や公開したくない写真・メモは保存しないでください。

従来の個人用`melonpan_records`、`rating_definitions`と非公開`melonpan-photos`はそのまま残り、新しい共有データとは別です。以前の端末内データは設定画面でJSONから復元し、「未投稿のローカル記録を共有する」を実行すると、選択中アカウントの投稿として共有できます。

列名だけのCSVテンプレート（`melonpan_accounts`、`melonpan_shared_records`、`melonpan_account_rating_definitions`）は `supabase-import` にあります。CSV取り込みでは型・制約・RLSポリシーは設定されないため、アプリ用にはSQLスキーマの実行を推奨します。

## Vercelへのデプロイ

1. このプロジェクトをGitHubにpushし、VercelでリポジトリをImportします。
2. Framework Presetは **Vite**、Build Commandは `npm run build`、Output Directoryは `dist` にします。Install Commandは `npm install` です。
3. `VITE_SUPABASE_URL` と `VITE_SUPABASE_PUBLISHABLE_KEY` をVercelの環境変数に設定します。Previewデプロイでも接続する場合はPreview環境にも設定します。

### アカウントが表示されない場合

アプリが一覧に使うのはSupabase Authのユーザーや別名のaccountsテーブルではなく、`public.melonpan_accounts`です。Table Editorでこのテーブルに行があるか、SQL Editorで `select id, name from public.melonpan_accounts;` を実行して確認してください。エラーが表示される場合は、Project URLがSupabaseのプロジェクトURLのみであること、publishable keyが正しいプロジェクトのものか、`supabase-schema.sql`を実行済みかを確認します。Vercelの環境変数を変更した後は必ず再デプロイしてください。PWAをインストール済みの場合はアプリを閉じて再度開くか、サイトデータを更新して最新版を読み込んでください。

### `melonpan_account_rating_definitions` がschema cacheにない場合

新しいアカウント別評価項目テーブルがSupabase側に未作成です。Supabase Dashboardの **SQL Editor** で `supabase-migration-account-rating-definitions.sql` の内容を実行してください。テーブル・RLS・権限を設定し、PostgRESTのschema cacheを再読み込みします。SQL実行後も同じエラーが続く場合は、Supabase Dashboardで正しいプロジェクトを開いていることを確認し、SQL Editorで `select to_regclass('public.melonpan_account_rating_definitions');` を実行してください。テーブル名が返るのにAPIエラーが続く場合は、Supabaseの **Project Settings > API > Reload schema cache**（またはSQL Editorで `notify pgrst, 'reload schema';`）を実行してください。

`VITE_`で始まる値はブラウザーに配信されます。公開用publishable keyだけを設定し、service role keyなどの秘密鍵は設定しないでください。

## データとバックアップ

記録には店名や任意の金額も入力でき、端末のIndexedDBと共有アカウントのクラウドに保存されます。JSONエクスポートには表示中のアカウントの記録・写真・設定が含まれ、復元に使えます。`public/sw.js` と `public/manifest.webmanifest` によりホーム画面へ追加でき、読み込んだアプリ資産はオフラインでも利用できます。クラウドへの読み書きにはインターネット接続が必要です。
