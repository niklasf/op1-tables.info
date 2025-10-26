[op1-tables.info](https://op1-tables.info)
==========================================

User interface to probe Marc Bourzutschky's 8-piece op1 tablebase.

Build frontend
--------------

From scratch:

```
npm install
npm run prepare
```

Watch mode: `npm run watch-js` & `npm run watch-css`

Then serve `dist/`.

Backend
-------

Tables generated and shared by Marc Bourzutschky. Raw tables hosted by
Lichess at https://op1.lichess.ovh/tables/.

Lichess also provides a [public API](https://lichess.org/api#tag/Tablebase) via
https://github.com/lichess-org/lila-tablebase, which in turn uses
https://github.com/lichess-org/op1 to query the tables.

License
-------

This project is licensed under the AGPL-3.0+.
