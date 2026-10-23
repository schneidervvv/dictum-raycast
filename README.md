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

### License

[MIT](LICENSE). Based on [TypeWhisper's Raycast extension](https://github.com/TypeWhisper/typewhisper-raycast) (MIT).
