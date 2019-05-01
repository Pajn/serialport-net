This project was bootstrapped with [tscomp](https://github.com/pajn/tscomp).

## Commands

#### `yarn test` or `npm test`
Runs the test watcher in interactive mode.
By default, runs test related to files changed since the last commit.

[Read more about testing in the Create React App README](https://github.com/facebook/create-react-app/blob/master/packages/react-scripts/template/README.md#running-tests)
tscomp does of course support test files with `.ts` and `.tsx` file endings as well.

#### `yarn watch` or `npm run watch`
Builds the library to the lib folder, or if you have changed your `tsconfig.json`,
to the `outDir` specified in it. The files will be rebuilt if you make edits.

#### `yarn build` or `npm run build`
Builds the library for production to the lib folder, or if you have changed your `tsconfig.json`,
to the `outDir` specified in it.

Your library is ready to be published!

## Converting to a Custom Setup

If you’re a power user and you aren’t happy with the default configuration, you can “eject” from the tool and use it as a boilerplate generator.

Running `npm run eject` copies all the configuration files and the transitive dependencies (Webpack, Babel, TypeScript, etc) right into your project so you have full control over them. Commands like `npm start` and `npm run build` will still work, but they will point to the copied scripts so you can tweak them. At this point, you’re on your own.

Note: this is a one-way operation. Once you eject, you can’t go back!

You don’t have to ever use eject. The curated feature set is suitable for small and middle deployments, and you shouldn’t feel obligated to use this feature. However we understand that this tool wouldn’t be useful if you couldn’t customize it when you are ready for it.
