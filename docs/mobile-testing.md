# Tester le prototype depuis un telephone

Le premier prototype web peut etre teste sans lancer manuellement d'infrastructure serveur. Il est deploye comme site statique GitHub Pages: l'application React embarque des donnees de demonstration et n'appelle pas encore l'API en runtime.

## Option recommandee pour le prototype: GitHub Pages

### 1. Activer GitHub Pages une seule fois

Dans le depot GitHub:

1. ouvrir **Settings** ;
2. aller dans **Pages** ;
3. choisir **Build and deployment > Source: GitHub Actions**.

Cette activation est un parametrage du depot, pas un serveur a administrer.

Si le job GitHub Actions echoue avec `Ensure GitHub Pages has been enabled`, cela signifie que cette etape n'a pas encore ete faite.

### 1 bis. Autoriser une branche de prototype

GitHub cree aussi un environnement `github-pages`. S'il autorise seulement `main`, un run lance depuis une branche `cursor/**` construit bien le site mais echoue avant le job `deploy`.

Pour tester une branche avant merge:

1. ouvrir **Settings > Environments** ;
2. cliquer sur **github-pages** ;
3. dans **Deployment branches and tags**, ajouter le pattern de branche `cursor/*`, ou choisir temporairement toutes les branches ;
4. relancer le workflow echoue.

Si cette etape n'est pas faite, le deploiement fonctionnera quand meme apres merge sur `main`.

### 2. Deployer

Le workflow `.github/workflows/deploy-web.yml` construit automatiquement `apps/web` et publie `apps/web/dist`.

Il se lance:

- automatiquement a chaque push sur `main` ;
- automatiquement a chaque push sur une branche `cursor/**` pour tester un prototype avant merge ;
- manuellement via **Actions > Deploy web prototype > Run workflow**.

### 3. Ouvrir sur mobile

Une fois le workflow termine, l'URL apparait dans le resume du job **deploy**. Pour ce depot, l'URL attendue est:

```text
https://piraog.github.io/cartov2/
```

Il suffit ensuite de l'ouvrir depuis le navigateur du telephone. Pendant la phase prototype, l'URL affiche la derniere branche deployee par le workflow.

## Pourquoi cette option convient maintenant

- aucune VM ni base de donnees a lancer ;
- aucune maintenance serveur ;
- HTTPS inclus ;
- partage facile par URL ;
- deploiement automatique apres merge.

## Limite assumee

Cette publication ne sert que le prototype statique. Quand la V1 utilisera l'API FastAPI, PostGIS et les donnees reelles, il faudra ajouter un backend heberge. Les options naturelles seront alors:

- frontend statique sur GitHub Pages, Vercel ou Netlify ;
- API sur Render, Fly.io, Railway, Scaleway, ou une VM ;
- base PostGIS managée ou conteneurisee.

Pour la phase actuelle, GitHub Pages evite de deployer cette infrastructure trop tot.
