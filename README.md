# dictum

在 Raycast 里控制 dictum：开始和结束听写、搜索和复制历史、管理词典、转写和翻译音频文件。

[English](#english)

## 准备

- 这台 Mac 上已安装并运行 dictum（正式版或开发版都可以）。
- 在 dictum 里打开 API 服务：**设置 > 高级 > 启用 API 服务器**。

## 命令

| 命令 | 作用 |
| -- | -- |
| **Start Dictation** | 开始或结束听写 |
| **Dictate with Workflow** | 用指定的工作流开始听写 |
| **Show Last Transcription** | 把最近一条转写复制到剪贴板 |
| **Search History** | 搜索、查看和复制转写历史 |
| **Transcribe File** | 转写一个音频文件（WAV、MP3、M4A、FLAC、OGG、AAC、MP4、WebM），可以选择翻译成另一种语言 |
| **Toggle Recording** | 开始或结束一段录音，例如会议录音 |
| **Show Last Recording** | 查看并复制最近一次从 Raycast 开始的录音的转写，可以选择翻译成另一种语言 |
| **Add Dictionary Term** | 把选中的文字或输入的词加入词典 |
| **Manage Dictionary** | 查看、添加、修改和删除词典词条与替换规则 |
| **Manage Workflows** | 启用或停用工作流，并用其中一个开始听写 |
| **Switch Model** | 选择语音识别引擎和模型 |
| **Open dictum** | 打开 dictum 主窗口 |

## 在另一台 Mac 上安装

需要 Raycast 和 Node.js 22.14 或更新版本。

```sh
git clone https://github.com/schneidervvv/dictum-raycast.git
cd dictum-raycast
npm install
npm run build
npm run dev
```

`npm run dev` 会把扩展导入 Raycast。终端显示 `ready - built extension successfully` 后，在 Raycast 里搜索 “dictum” 就能看到全部命令。之后可以按 Control-C 结束 `npm run dev`，扩展会留在 Raycast 里。

扩展自动读取 dictum 的 API 端口和令牌，不需要手动填写。dictum 打开 API 服务时会把端口和令牌写到下面的文件里，关闭时删除：

- 正式版：`~/Library/Application Support/dictum/api-discovery.json`
- 开发版：`~/Library/Application Support/dictum-Dev/api-discovery.json`

两个版本同时运行时，扩展先连接最近启动 API 服务的那个；它拒绝令牌时，再连接另一个。如果 dictum 使用了自定义端口，在扩展设置的 **API Port Override** 里填写端口。

## 从 Raycast 开始听写

Start Dictation、Dictate with Workflow 和 Manage Workflows 开始或结束听写前，会关闭 Raycast 窗口并重新打开之前的应用，文字插入那个应用。重新打开会让应用收到“重新打开”事件：之前的应用没有窗口时，Finder 会新开一个窗口，TextEdit 会显示“打开”面板，文字会插入那里。先在应用里打开一个窗口或文档，再从 Raycast 开始听写。

## 翻译

在 Transcribe File 的 **Translate to** 里，或 Show Last Recording 操作菜单的 **Transcribe and Translate to** 里选择目标语言后，dictum 先转写，再用 macOS 的翻译功能翻译，所以任何语音识别引擎都能翻译成列表里的任何语言。macOS 需要先下载音频语言和目标语言：在“系统设置 > 通用 > 语言与地区 > 翻译语言”里下载。缺少语言时 macOS 会在 dictum 里弹出下载窗口，扩展等待超时后会提示下载这两种语言。

## 授权

[MIT](LICENSE)。本扩展基于 [TypeWhisper 的 Raycast 扩展](https://github.com/TypeWhisper/typewhisper-raycast)（MIT 授权）修改。

## English

Control dictum from Raycast: start and stop dictation, search and copy history, manage the dictionary, and transcribe and translate audio files.

### Prerequisites

- dictum (Release or Dev build) is installed and running on this Mac.
- The API server is enabled in dictum: **Settings > Advanced > Enable API Server**.

### Commands

| Command | Description |
| -- | -- |
| **Start Dictation** | Start or stop dictation |
| **Dictate with Workflow** | Start a dictation that uses a specific workflow |
| **Show Last Transcription** | Copy the most recent transcription to the clipboard |
| **Search History** | Search, browse and copy transcription history |
| **Transcribe File** | Transcribe an audio file (WAV, MP3, M4A, FLAC, OGG, AAC, MP4, WebM), optionally translated into another language |
| **Toggle Recording** | Start or stop a recording, for example of a meeting |
| **Show Last Recording** | Show and copy the transcript of the last recording started from Raycast, optionally translated into another language |
| **Add Dictionary Term** | Add the selected text or a typed word to the dictionary |
| **Manage Dictionary** | Browse, add, edit and delete dictionary terms and corrections |
| **Manage Workflows** | Enable or disable workflows and start a dictation with one |
| **Switch Model** | Choose the speech engine and model |
| **Open dictum** | Open the dictum main window |

### Install on another Mac

Requires Raycast and Node.js 22.14 or later.

```sh
git clone https://github.com/schneidervvv/dictum-raycast.git
cd dictum-raycast
npm install
npm run build
npm run dev
```

`npm run dev` imports the extension into Raycast. Once the terminal shows `ready - built extension successfully`, search Raycast for "dictum" to see every command. You can then stop `npm run dev` with Control-C; the extension stays in Raycast.

The extension reads dictum's API port and token on its own. While its API server runs, dictum writes them to the file below and deletes it when the server stops:

- Release: `~/Library/Application Support/dictum/api-discovery.json`
- Dev: `~/Library/Application Support/dictum-Dev/api-discovery.json`

When both builds run, the extension first connects to the one that started its API server last; if that one rejects the token, it connects to the other. If dictum uses a custom port, set it under **API Port Override** in the extension preferences.

### Starting dictation from Raycast

Before Start Dictation, Dictate with Workflow and Manage Workflows start or stop a dictation, they close the Raycast window and reopen the app you came from; dictum inserts the text there. Reopening sends the app a "reopen" event: when that app has no window, Finder opens a new window and TextEdit shows its Open panel, and the text goes there. Open a window or document in the app first, then start the dictation from Raycast.

### Translation

Choose a target language under **Translate to** in Transcribe File, or with the **Transcribe and Translate to** action in Show Last Recording, and dictum transcribes first and then translates with macOS translation, so every speech engine can translate into every language in the list. macOS needs the language of the audio and the target language downloaded first: download them in System Settings > General > Language & Region > Translation Languages. When one is missing, macOS shows a download window in dictum, and after the request times out the extension tells you to download both languages.

### License

[MIT](LICENSE). Based on [TypeWhisper's Raycast extension](https://github.com/TypeWhisper/typewhisper-raycast) (MIT).
