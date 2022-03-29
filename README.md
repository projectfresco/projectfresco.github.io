# Fresco
An alternative JS-based add-ons site front-end for XUL-based applications.

## Installation
- Obtain a copy of the files contained in the `/src/` directory of this repository.
- Place the source files in a new directory named `/addons`.
- Obtain a copy of the metadata used by Fresco from [fresco-content](https://github.com/projectfresco/fresco-content).
- Place the metadata files in a new directory named `/addons-content`.

If you intend to use GitHub as an add-on releases data source, replace the contents of `/src/assets/config.js` with a JS function named `gat` that returns a GitHub Personal Access Token.

## Issues
Please use the [issue tracker](https://github.com/projectfresco/fresco/issues) when contributing and reporting bugs, enhancements or to-do's.

## License
This project is licensed under the Mozilla Public License Version 2.0, except for Fresco branding assets and those contained in the following directories:
- `/src/assets/libs`
