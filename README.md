# MCU Memory Debug

MCU Memory Debug 是一个用于 MCU 调试的 VSCode 扩展，它提供了内存查看和分析功能，特别适用于使用 QEMU 和 GDB 进行调试的场景。

## 功能特点

- 🔍 实时内存查看：支持查看 MCU 的内存内容和寄存器值
- 📊 内存布局可视化：直观显示内存分配和使用情况
- 🔄 自动刷新：调试过程中自动更新内存信息
- 💾 支持多种内存区域：包括 Flash、SRAM 等
- 🛠 集成 GDB 调试：与 cortex-debug 无缝集成

## 安装要求

- Visual Studio Code 1.80.0 或更高版本
- cortex-debug 扩展
- GDB 调试工具
- QEMU（可选，用于仿真调试）

## 使用方法

1. 安装扩展后，在 VSCode 中打开您的 MCU 项目
2. 启动调试会话（使用 cortex-debug）
3. 在 VSCode 侧边栏中找到 "MCU Memory Explorer" 视图
4. 使用提供的功能查看和分析内存

## 扩展设置

此扩展提供以下设置：

* `mcuMemoryDebug.flash.start`: Flash 内存起始地址
* `mcuMemoryDebug.flash.size`: Flash 内存大小（KB）
* `mcuMemoryDebug.sram.start`: SRAM 起始地址
* `mcuMemoryDebug.sram.size`: SRAM 大小（KB）

## 已知问题

- 暂无已知问题

## 更新日志

详见 [CHANGELOG.md](CHANGELOG.md)

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件
