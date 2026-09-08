# CSO demo

This app uses the declared CSO core and React packages. It builds and tests with
its own files and those installed dependencies:

```sh
npm install
npm run build
npm test
```

Supply optional data directories when starting or building the app:

- `CSO_GALLERY_DIRECTORY`: CSO `.json` files. Files beginning with `_` or `.`
  are auxiliary files and are ignored. Every selected document is validated.
- `CSO_PREPARED_DIRECTORY`: validated `.prepared.json` files.

Without these inputs the gallery and prepared-document viewer show empty states.
The workspace launcher supplies its two-panel gallery and synthetic rendering data;
the app contains no paths or imports tied to that repository layout.
