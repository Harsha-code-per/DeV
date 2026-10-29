`slugify` in `src/slugify.ts` produces bad URL slugs. For example `slugify("Rock & Roll  Forever!")` should be `"rock-roll-forever"`.

Fix it so a slug is:
- lowercase ASCII letters and digits only, with words separated by a single `-`
- accented letters reduced to their base letter (`é` becomes `e`)
- every other character treated as a separator
- no leading or trailing `-`
