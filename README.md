# STL Inspector

A web-based tool for analyzing and inspecting STL (STereoLithography) files, identifying mesh issues such as holes, non-manifold edges, degenerate faces, and inconsistent normals. The application provides an interactive 3D viewer with various rendering options and issue highlighting.

## Features

- **File Upload**: Upload STL files for analysis
- **Mesh Analysis**: Detects common mesh issues (holes, non-manifold edges, degenerate faces, etc.)
- **3D Viewer**: Interactive Three.js-based viewer with multiple rendering modes
- **Issue Inspection**: Step through and highlight detected issues
- **Component Analysis**: Identify and isolate mesh components
- **View Settings**: Customize rendering (wireframe, x-ray, edges, etc.)
- **Responsive UI**: Works on desktop and mobile devices

## Architecture Overview

The application consists of a Python backend and a JavaScript frontend.

### Backend (Python/Flask)
- `server.py`: Flask server handling file uploads and analysis requests
- `analyze_stl.py`: Core mesh analysis logic using trimesh library

### Frontend (JavaScript/ES6 Modules)
- `main.js`: Application entry point, initializes controllers and event handlers
- `eventHandlers.js`: DOM event listeners for user interactions
- `uiRefresh.js`: Functions for refreshing UI components
- `config.js`: Configuration constants and utilities
- `state.js`: Centralized application state management
- `selection/store.js`: Selection state management
- `ui/dom.js`: DOM element references
- `ui/render.js`: UI rendering functions
- Controllers:
  - `app/componentsController.js`: Manages mesh component selection
  - `app/issuesController.js`: Handles issue selection and highlighting
  - `app/viewSettingsController.js`: Manages viewer settings persistence
  - `app/layoutController.js`: Handles UI layout and mobile responsiveness
  - `app/statusController.js`: Manages status messages
- Viewer modules (`viewer/`): Three.js-based 3D rendering
  - `viewer.js`: Main viewer interface
  - `viewer-init.js`: Viewer initialization
  - `viewer-mesh.js`: Mesh loading and processing
  - `viewer-view-settings.js`: Rendering settings
  - `viewer-highlight.js`: Issue highlighting
  - `viewer-components.js`: Component visualization
  - `viewer-camera.js`: Camera controls
  - `viewer-geometry.js`: Geometry processing
  - `viewer-ui.js`: Viewer UI integration

### Data Flow

```
User Upload → server.py → analyze_stl.py → Analysis Results
                                      ↓
main.js → Controllers → Viewer → UI Updates
    ↑
eventHandlers.js ← User Interactions
```

Detailed data flow:

1. **File Upload**: User selects STL file → `eventHandlers.js` → Fetch to `/api/analyze` → `server.py`
2. **Analysis**: `server.py` → `analyze_stl.py` → Returns mesh data + issues
3. **Initialization**: `main.js` → Creates controllers → Sets up event handlers
4. **User Interaction**: Events → `eventHandlers.js` → Updates state → Refreshes UI via `uiRefresh.js`
5. **Rendering**: Controllers → Viewer modules → Three.js scene updates

## Setup Instructions

### Prerequisites
- Python 3.8+
- Node.js (for Vite dev server, optional)

### Backend Setup
1. Create virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Run the server:
   ```bash
   python3 server.py
   ```
   Server will start on http://127.0.0.1:5000

### Frontend Development
1. Install Vite (optional, for development):
   ```bash
   npm install -g vite
   ```

2. Start dev server:
   ```bash
   vite
   ```
   Frontend will be served on http://localhost:5173 with hot reload

### Production
For production, serve the `frontend/` directory with a static server, and ensure the backend API endpoints are correctly configured in `config.js`.

## Usage

1. Open the application in a web browser
2. Click "Upload STL" and select an STL file
3. Wait for analysis to complete
4. Use the Issues panel to browse detected problems
5. Use the Components panel to isolate mesh parts
6. Adjust view settings in the render panel
7. Use keyboard shortcuts:
   - `j/k` or `←/→`: Navigate issues
   - `a`: Toggle all/step mode
   - `h`: Toggle highlights
   - `c`: Center view
   - `f`: Frame view

## Development

### Code Structure
- Follow ES6 module pattern
- Use JSDoc comments for functions
- Keep controllers focused on single responsibilities
- Extract constants to `config.js`
- Handle errors gracefully with user feedback

### Adding New Features
1. Identify the appropriate controller or create a new one
2. Update `main.js` to initialize the new component
3. Add event handlers in `eventHandlers.js`
4. Update UI rendering in `uiRefresh.js` or `ui/render.js`
5. Test thoroughly across different devices

### Testing
- Test with various STL files (good and bad meshes)
- Verify mobile responsiveness
- Check keyboard navigation
- Validate error handling

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make changes with proper documentation
4. Test thoroughly
5. Commit with descriptive messages
6. Push and create a pull request

### Code Style
- Use consistent naming conventions
- Add JSDoc comments for public functions
- Keep functions small and focused
- Use async/await for asynchronous operations
- Handle errors appropriately

## License

[Add license information here]

## Acknowledgments

- Built with Three.js for 3D rendering
- Uses trimesh for mesh analysis
- Bootstrap Icons for UI elements