const path = require("path");

module.exports = {
    mode: "development",
    entry: "./src/index.ts",
    output: {
        path: path.resolve(__dirname, "dist-dev"),
        filename: "html5-qrcode.js",
        library: "__Html5QrcodeLibrary__",
        clean: true,
    },
    resolve: {
        extensions: [".ts", ".js"],
    },
    target: "web",
    devtool: "source-map",
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
        minimize: false,
    },
    devServer: {
        static: [
            { directory: path.resolve(__dirname, "app") },
            { directory: path.resolve(__dirname, "dist-dev"), publicPath: "/dist-dev" },
        ],
        port: 4000,
        hot: true,
        open: true,
        headers: {
            "Access-Control-Allow-Origin": "*",
        },
    },
};
