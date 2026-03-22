# Ad-Morph Editor

React web editor for the Ad-Morph project. See the [root README](../README.md) for full documentation.

## Dev

```bash
npm install
npm run dev    # http://localhost:5173
npm run build
```

## Testing without the extension

Paste a JSON array of `AdElement` objects into localStorage and reload:

```js
localStorage.setItem('adMorphAds', JSON.stringify([{
  id: 'ad-test',
  elements: [...],
  capturedAt: Date.now()
}]))
```
