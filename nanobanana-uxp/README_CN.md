# Nanobanana (Gemini) Photoshop 插件使用指南

这个插件允许你在 Photoshop 2025+ 中调用 Google Gemini (Nanobanana) API 进行图片编辑，如局部重绘、画头发丝和产品精修。

## 1. 准备工作

*   **Photoshop 版本**：需要 Photoshop 2024 (v24.0) 或更高版本（推荐 2025）。
*   **API Key**：你需要一个 Google Gemini 的 API Key。
    *   可以在这里申请：[Google AI Studio](https://aistudio.google.com/app/apikey)

## 2. 安装与加载

由于这是一个开发版插件，你需要使用 **Adobe UXP Developer Tool** 来加载它。

1.  **下载并安装** [Adobe UXP Developer Tool](https://developer.adobe.com/photoshop/uxp/dev-tool/).
2.  打开 Photoshop。
3.  打开 UXP Developer Tool。
4.  点击右上角的 **"Add Plugin"** 按钮。
5.  选择本插件文件夹中的 `manifest.json` 文件。
6.  在列表中找到 "Nanobanana Magic"，点击右侧的 **"Load"** (播放图标) 按钮。
7.  插件面板应该会在 Photoshop 中显示出来。

## 3. 如何使用

### 第一步：输入 API Key
*   在插件面板顶部的 "Gemini API Key" 输入框中，粘贴你的 API Key。
*   插件会自动记住你的 Key（保存在本地）。

### 第二步：建立选区 (重要)
*   **必须先在 Photoshop 中建立一个选区**。
*   使用套索工具 (Lasso Tool) 或 选框工具 (Marquee Tool) 圈出你想要修改的区域。
    *   *例如：如果你想给模特加头发，就圈出头部边缘的区域。*
    *   *例如：如果你想换掉沙发，就圈出沙发。*

### 第三步：生成内容
你有两种方式生成：

**方式 A：使用预设按钮**
*   **局部重绘 (Inpaint)**：根据画面内容自然地重绘选区。
*   **画头发丝 (Draw Hair)**：专门用于生成高精度的发丝细节。
*   **产品精修 (Retouch)**：用于平滑表面、优化光影，适合产品摄影。

**方式 B：自定义 Prompt**
*   在文本框中输入你具体的描述（支持英文描述，效果通常更好）。
*   然后点击任意一个按钮（按钮的预设提示词会和你的描述组合在一起）。

### 第四步：等待结果
*   点击按钮后，状态栏会显示 "Processing..."。
*   稍等片刻（取决于网络速度），生成的图片会自动作为 **新图层** 盖在你原来的选区上方。
*   你可以随时隐藏或删除这个新图层，原图不会被修改。

## 注意事项
*   确保你的网络可以访问 Google API (`generativelanguage.googleapis.com`)。
*   生成的图片是基于你选区的截图进行的，所以选区越大，包含的上下文信息越多。
