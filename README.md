# Crosshair Y

![License](https://img.shields.io/badge/license-MIT-green)
![Electron](https://img.shields.io/badge/Electron-v37.2.5-blue)
![Build](https://img.shields.io/badge/build-passing-brightgreen)

Crosshair Y is a free and open-source alternative to Crosshair X, designed to provide customizable crosshair overlays for your games. Whether you're aiming for precision or style, Crosshair Y offers a variety of built-in crosshairs and supports custom crosshair images to enhance your gaming experience.

- **MOVABLE CROSSHAIR** - This is a fork, with an option to move the crosshair position along the display.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Built-in Crosshairs**: Choose from a variety of pre-installed crosshair designs.
- **Custom Crosshairs**: Easily add your own custom crosshair images.
- **Adjustable Size, Hue, Rotation & Opacity**: Dial-in the perfect look and visibility. 
- **Presets**: Save, load, and delete crosshair configurations on the fly from the Settings panel.
- **Cross-Platform**: Available for Windows and Linux.
- **Lightweight & Efficient**: Minimal system resource usage ensures smooth performance.
- **User-Friendly Interface**: Intuitive UI for easy configuration and management.
- **Built-in SVG Editor**: Effortlessly make changes to your SVGs in a single, fluid workspace.

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v14 or later)
- [Git](https://git-scm.com/) (optional, for cloning the repository)

### Clone the Repository

```bash
git clone https://github.com/YSSF8/crosshair-y.git
cd crosshair-y
```

### Install Dependencies

```bash
npm install
```

### Running the Application

```bash
npm start
```

## Building for Distribution

Crosshair Y can be packaged for Windows and Linux using Electron Packager.

### Build for Windows (64-bit)

```bash
npm run build:win32
```

### Build for Windows (32-bit)

```bash
npm run build:win32-32bit
```

### Build for Linux (64-bit)

```bash
npm run build:linux
```

The built applications will be located in the `build/` directory.

## Usage

1. **Launching the App**: After running `npm start`, the main window will appear.
2. **Selecting a Crosshair**:
   - **Built-in**: Navigate to the "Built-in" section to choose from pre-installed crosshairs.
   - **Custom**: Add your own crosshair images by selecting a directory containing `.png` or `.svg` files.
3. **Customizing**:
   - **Size**: Adjust the size slider to change the crosshair size.
   - **Hue**: Modify the hue slider to change the crosshair color.
   - **Rotation**: Adjust the rotation slider to rotate the crosshair.
   - **Opacity**: Adjust the opacity slider to change the crosshair visibility level.
4. **Presets**: Use the “Presets” pane to save your current setup, load a previously saved one, or delete any you no longer need.
5. **Toggling Visibility**: Use the toggle switch to show or hide the crosshair overlay.
6. **Settings**: Access the settings window to reset configurations or manage crosshair directories.

## Configuration

Crosshair Y stores user configurations in the `localStorage`. You can modify settings directly through the application's UI:

- **Crosshair Size**: Adjust using the size range slider in the settings.
- **Hue**: Change the crosshair color hue via the hue range slider.
- **Rotation**: Change the rotation level of the crosshair via the rotation range slider.
- **Opacity**: Adjust using the opacity range slider in the settings.
- **Crosshair Directory**: Select a custom directory containing your crosshair `.png` files.

### Resetting to Default

To reset all configurations to default:

1. Open the settings window by clicking the settings icon.
2. Click the "Reset" button.
3. This will revert the size, hue, and crosshair selections to their default values.

## Contributing

We welcome contributions from the community!

## License

This project is licensed under the [MIT License](LICENSE).

---

**Developed by [YSSF](https://github.com/YSSF8)**
