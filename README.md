# メロンパン日記

スマホでメロンパンを記録・振り返りできる、React + TypeScript + Vite 製のPWAです。記録はIndexedDBに保存し、Supabaseを設定するとアカウントごとに複数端末で同期できます。

## 起動・ビルド

Node.js 20以降とpnpmを用意し、プロジェクト直下で実行します。

```bash
pnpm install
pnpm dev
pnpm build
pnpm preview
```

## Supabaseの準備

1. Supabaseでプロジェクトを作成します。
2. Supabase Dashboardの **SQL Editor** で、リポジトリの `supabase-schema.sql` を一度実行します。記録用テーブル、評価項目テーブル、写真用の非公開Storage bucket、ユーザーごとのRLSポリシーが作成されます。
3. **Project Settings > API Keys** からProject URLとpublishable keyを取得します。secret keyやservice role keyはブラウザー側で使わないでください。
4. 開発時は `.env.example` を `.env.local` にコピーし、値を設定します。

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxxxxxxx
   ```

5. **Authentication > URL Configuration** のSite URLを公開するVercelのURL（例: `https://your-app.vercel.app`）にします。Redirect URLsには公開URLと開発用URL（`http://localhost:5173/**`）を登録します。メール確認リンクの遷移先はSite URLが使われます。
6. **Authentication > Sign In / Providers > Email** でEmail providerを有効にします。メール確認を有効にしている場合、新規登録後に確認メールを開き、その後アプリでログインしてください。
7. **Authentication > Sessions** の時間制限を利用する場合は、アプリの1年間の保持期間より短くならないようにします。セッションの時間制限機能はSupabaseのプランによって利用可否が異なります。

## Vercelへのデプロイ

1. このプロジェクトをGitHubにpushし、VercelでリポジトリをImportします。
2. Framework Presetは **Vite**、Build Commandは `npm run build`、Output Directoryは `dist` にします。Install Commandは通常 `npm install` のままで構いません。`node_modules` と `dist` はGitへ含めず、`.gitignore` の設定を維持してください。
3. Vercelの **Project Settings > Environment Variables** に `VITE_SUPABASE_URL` と `VITE_SUPABASE_PUBLISHABLE_KEY` を登録します。ProductionだけでなくPreviewでも使う場合は、対象環境を選んで登録します。
4. 環境変数を反映するため再デプロイし、公開URLで動作を確認します。
5. 公開ドメインが決まったらSupabaseのSite URLとRedirect URLsもそのドメインに合わせます。

`VITE_` で始まる値はブラウザーに配信されます。publishable keyはRLSと組み合わせて使う公開キーです。service role keyなどの秘密鍵はVercelのフロントエンド環境変数にも設定しないでください。

## アカウントとセッション

ログイン状態はブラウザーのlocalStorageに保存され、再アクセス時にSupabaseのrefresh tokenで認証状態を復元します。アクセストークンは期限が切れる前後に自動更新され、ログインから1年が経過すると保存済みセッションを破棄して再ログインを求めます。既存の保存済みセッションは、この仕様への更新後、最初に読み込んだ日から1年間保持します。

セッションを早く終了するには設定画面の「ログアウト」を使ってください。ブラウザーのサイトデータを消去した場合、パスワード変更などでSupabase側からセッションが無効化された場合、またはSupabase側のセッション制限に達した場合は、1年以内でも再ログインが必要です。共有端末ではログアウトしてください。

## データと同期

記録と選択した写真はIndexedDBにも保存されます。アカウントにログインした後、設定画面の「この端末のデータをクラウドへ移行」で既存データをアップロードできます。別のブラウザーや端末では同じアカウントでログインし、「クラウドから取得」を実行してください。この操作は現在の端末データを置き換えるため、確認画面で内容を確認してください。

JSONエクスポートには記録・写真・設定が含まれ、復元に使えます。CSVは表計算ソフト向けのUTF-8 BOM付きです。`public/sw.js` と `public/manifest.webmanifest` によりホーム画面へ追加でき、読み込んだアプリ資産はオフラインでも利用できます。クラウド同期にはインターネット接続が必要です。
