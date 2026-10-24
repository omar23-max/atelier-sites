# Relier l'atelier à Supabase

La base en ligne reçoit : projets (marque, offre, créatives, publication),
pages et leur historique, sections, designs, templates, demandes, images créées
dans l'atelier, et le suivi des ventes. Les fichiers du dossier restent la copie
de travail ; la base est synchronisée toutes les 15 minutes (avec la sauvegarde
GitHub) ou à la demande (`npm run sync`).

## 1. Créer le compte et le projet (toi)

1. Va sur **https://supabase.com** → **Start your project** → crée ton compte
   (le plus simple : « Continue with GitHub » avec omar23-max).
2. **New project** :
   - Organization : la tienne (créée automatiquement) ;
   - Name : `atelier-sites` ;
   - Database Password : clique « Generate a password » et **garde-le** dans
     ton gestionnaire de mots de passe (on n'en a pas besoin pour l'atelier) ;
   - Region : **Canada (Central)** ;
   - plan : **Free**.
3. Attends 1 à 2 minutes que le projet soit prêt.

## 2. Créer les tables (toi, 1 minute)

1. Dans le projet : menu de gauche **SQL Editor** → **New query**.
2. Ouvre le fichier `atelier-sites/supabase/schema.sql`, copie tout, colle-le.
3. Clique **Run**. Tu dois voir « Success. No rows returned ».

## 3. Donner l'accès à l'atelier (toi)

1. **Project Settings** (roue dentée) → **API Keys** (ou **API**).
2. Copie :
   - le **Project URL** (Settings → Data API, de la forme `https://xxxx.supabase.co`) ;
   - la clé **secrète** : `service_role` (onglet « Legacy API keys ») ou une
     **Secret key** `sb_secret_…`. Clique « Reveal » puis copie-la entière.
3. Dans le dossier `atelier-sites`, copie `.env.example` en **`.env.local`** et
   colle les 2 valeurs :

   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=la-clé-secrète
   ```

Cette clé donne tous les droits sur la base : ne la colle nulle part ailleurs
(ni dans un chat, ni dans le code). `.env.local` n'est jamais envoyé sur GitHub.

## 4. Envoyer les données (Claude)

Dis à Claude « Supabase est prêt ». Il lance :

- `npm run sync -- --verifier` : teste la connexion et les tables ;
- `npm run sync` : envoie tout (les images seulement si elles ont changé).

Ensuite c'est automatique toutes les 15 minutes ; le journal est dans
`.git/sauvegarde.log`.

## Sécurité

- Seul le serveur local de l'atelier écrit dans la base, avec la clé secrète.
- La sécurité par ligne (RLS) est activée sans règle publique : la clé publique
  (`anon`) ne voit rien.
- Les images sont dans un stockage **privé** (bucket `medias`).
- Les photos d'origine des sites importés ne sont jamais envoyées.
