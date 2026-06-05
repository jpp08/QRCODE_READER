const path = require("path");

module.exports = {
    mode: "production",
    entry: "./src/index.ts",
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "html5-qrcode.min.js",
        library: "__Html5QrcodeLibrary__",
        clean: false,
    },
    resolve: {
        extensions: [".ts", ".js"],
    },
    target: "web",
    devtool: false,
    module: {
        rules: [
            {
                test: /\.tsx?/,
                use: "ts-loader",
                exclude: /node_modules/,
            },
        ],
    },
    optimization: {
        minimize: true,
        usedExports: true,
    },
};
