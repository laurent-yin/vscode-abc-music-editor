/**
 * This file handles the conversion of ABC notation to SVG graphics in the webview
 * Key steps in the process:
 * 1. Receive ABC content from the VS Code extension
 * 2. Parse the ABC content using abc2svg library
 * 3. Render the SVG graphics and add them to the DOM
 * 4. Handle user interactions like playback and selection
 */

// Define interfaces for the VS Code API and abc2svg
declare function acquireVsCodeApi(): {
    postMessage: (message: any) => void;
    getState: () => any;
    setState: (state: any) => void;
};

// Define interfaces for abc2svg
interface ABC2SVG {
    /**
     * Loads JavaScript modules needed by abc2svg during rendering
     * @param fn Filename of the module to load
     * @param relay Callback function on successful load
     * @param onerror Callback function on error
     */
    loadjs: (fn: string, relay?: (event?: any) => void, onerror?: (event?: any) => void) => void;
    
    /** Constructor for the main ABC parsing/rendering instance */
    Abc: new (user: User) => AbcInstance;
    
    /** Module handling system for loading optional abc2svg modules */
    modules: {
        load: (content: string, callback: () => void, errorCallback: (error: any) => void) => boolean;
    };
    
    /** Constants used by abc2svg */
    C: any;
}

interface AbcInstance {
    /**
     * Converts ABC notation to SVG
     * @param id Identifier for the tune
     * @param content ABC notation to convert
     * Output: Calls user.img_out() for each SVG section generated
     */
    tosvg: (id: string, content: string) => void;
    
    /**
     * Outputs raw SVG content
     * @param s SVG string to output
     * Output: Calls user.img_out() with the SVG string
     */
    out_svg: (s: string) => void;
    
    /**
     * Outputs SVG coordinates
     * @param x X coordinate
     * @param y String to insert between x and sy
     * @param sy Y coordinate
     * Output: Formats coordinates for SVG elements
     */
    out_sxsy: (x: number, y: string, sy: number) => void;
    
    /**
     * Adjusts height in the SVG coordinate system
     * @param h Height value to adjust
     * @returns Adjusted height value
     */
    sh: (h: number) => number;
    
    /** Gets the current formatting parameters */
    cfmt: () => any;
    
    /** Array of tunes in the ABC content */
    tunes: Array<any>;
}

interface User {
    /**
     * Callback to handle image output
     * @param s SVG string to append to the output
     * Output: Collects SVG content that will be added to the DOM
     */
    img_out: (s: string) => void;
    
    /** Image size attribute for SVG tags */
    imagesize: string;
    
    /**
     * Error message handler
     * @param msg Error message
     * @param line Line number where error occurred
     * @param col Column number where error occurred
     * Output: Sends error messages back to VS Code
     */
    errmsg: (msg: string, line?: number, col?: number) => void;
    
    /**
     * Annotation callback for creating interactive elements
     * Creates clickable rectangles around musical elements
     * Output: Generates SVG rectangles that can be used for selection
     */
    anno_stop?: (type: string, start: number, stop: number, x: number, y: number, w: number, h: number, s: any) => void;
    
    /** Controls if page formatting should be applied */
    page_format?: boolean;
}

interface PlayOptions {
    onend: (repv?: number) => void;
    onnote: (note: any) => void;
}

interface AbcPlay {
    play: (si: any, ei: any, repv?: number) => void;
    stop: () => void;
    add: (start: any, voice: any, options?: any) => void;
}

interface PlayState {
    abcplay?: AbcPlay;
    playing?: boolean;
    stop?: number;
    si?: any;
    ei?: any;
    loop?: boolean;
    repv?: number;
    click?: any;
}

// Interface for SVGElement className
interface SVGElementWithClassName extends SVGElement {
    className: {
        baseVal: string;
    };
}

// Declare global variables needed by abc2svg
declare const abc2svg: ABC2SVG;
declare function AbcPlay(options: PlayOptions): AbcPlay;
declare const LZString: any;

// Initialize variables
const vscode = acquireVsCodeApi();
let abc: AbcInstance;
let currentAbcContent = ''; // Store the current ABC text to detect changes
let user: User; // IMPORTANT: user needs to be in the global scope for some modules to work properly (e.g. page module)

// Variables needed for playback
const play: PlayState = {};
let tunes: any[];
let syms: any[] = [];   // Music symbol at source index
const selx: [number, number] = [0, 0]; // (start, end) of the selection
const selx_sav: number[] = []; // (saved while playing/printing)

/**
 * Dynamic script loader used by abc2svg to load required modules
 * Output: Injects <script> tags into document.head to load additional functionality
 */
abc2svg.loadjs = function(fn: string, relay?: (event?: any) => void, onerror?: (event?: any) => void): void {
    const script = document.createElement('script');
    script.src = `${(window as any).baseUri}/lib/${fn}`;
    script.type = 'text/javascript';
    script.onload = (event) => {
        console.log('loaded module ' + fn);
        if (relay) { relay(event); }
    }
    script.onerror = (event) => {
        if (onerror) { onerror(event); }
        console.log('error loading module ' + fn);
    }    
    document.head.appendChild(script);
}

// Load snd-1.js for midi playback
abc2svg.loadjs("snd-1.js", function() {
    console.log("snd-1.js loaded successfully");
    play.abcplay = AbcPlay({
        onend: endplay,
        onnote: (note: any) => console.log("Playing note:", note),
    });
});

// Process messages received from the extension
window.addEventListener('message', event => {
    const msg = event.data;
    if (msg.command === 'render') {
        // Store the content in the outer scope variable
        const abcContent = msg.content;
        currentAbcContent = abcContent;
        const div = document.getElementById('sheet') as HTMLDivElement;
        div.innerHTML = '';

        if (abc2svg) {
            // This variable collects all SVG output generated during the rendering process
            // It will contain multiple SVG elements, typically one per staff/line of music
            let abc_images = '';
            
            // Configure the user object with callbacks that abc2svg will use during rendering
            user = {
                // img_out is called by abc2svg for each SVG snippet it generates
                // These snippets are accumulated in abc_images and later inserted into the DOM
                img_out: (s: string) => { abc_images += s; },
                
                // Set SVG image size to be responsive
                imagesize: 'width="100%"',
                
                // Forward error messages to VS Code
                errmsg: (msg: string, line?: number, col?: number) => { 
                    vscode.postMessage({ command: 'error', message: msg, line, col }); 
                },
                
                // anno_stop creates interactive rectangles for each musical element
                // Output: Generates invisible SVG rectangles that can be used for selection/interaction
                anno_stop: function(type: string, start: number, stop: number, x: number, y: number, w: number, h: number, s: any) {
                    // Skip certain element types
                    
                    if (["beam", "slur", "tuplet"].indexOf(type) >= 0)
                        return;
                    
                    // Store the music symbol for later use (e.g., playback)
                    syms[start] = s;

                    if (["note", "rest", "Zrest"].indexOf(type) == -1)
                        return;
            
                    // Create a rectangle element for this musical symbol
                    // This rectangle will be invisible initially but can be highlighted when selected
                    abc.out_svg('<rect class="abcr _' + start +
                        '_" x="');
                    // Position the rectangle using the symbol's coordinates
                    abc.out_sxsy(x, '" y="', y);
                    // Set the rectangle's dimensions
                    abc.out_svg('" width="' + w.toFixed(2) +
                        '" height="' + abc.sh(h).toFixed(2) + '"/>\n');
                },
                
                // Enable page formatting
                page_format: true
            };
            
            /**
             * Renders ABC notation to SVG
             * @param abcContent ABC notation string to render
             * @param div DOM element to insert the resulting SVG into
             * 
             * Workflow:
             * 1. abc.tosvg() parses the ABC content and generates SVG
             * 2. During parsing, it calls user.img_out() for each SVG element
             * 3. These elements are collected in abc_images
             * 4. The collected SVG content is then inserted into the DOM
             */
            function renderAbc(abcContent: string, div: HTMLDivElement): void {
                console.log('rendering ABC content');

                // TODO: remove this after finishing debugging fit2box
                // let cfmt = abc.cfmt();
                // cfmt.pagewidth = 600;
                // cfmt.pageheight = 800;

                // This is the main call that starts the rendering process
                // It will call user.img_out() multiple times with SVG content
                abc.tosvg('abc', abcContent);
                
                // Insert all the collected SVG content into the DOM
                div.innerHTML = abc_images;
                
                // Set up selection overlay after rendering
                setupSelectionOverlay();
                
                if (abc_images === '') {
                    console.log('no images generated');
                }
            }

            // Reset selection and symbols before re-render
            selx[0] = selx[1] = 0;
            syms = [];
            
            // Create a new ABC instance with our user callbacks
            abc = new abc2svg.Abc(user);
            
            // Try to load any modules that might be needed based on the ABC content
            // This checks for special annotations in the ABC that require additional modules
            if (abc2svg.modules.load(abcContent, () => {
                console.log('rendering after loading modules');
                renderAbc(abcContent, div);
            }, console.error)) {
                // If modules.load returns true, it means no modules needed loading
                // or they were already loaded, so we can render immediately
                console.log('rendering when modules.load returns true');
                renderAbc(abcContent, div);
            }
        }
    }
});

/**
 * Add necessary SVG overlay elements for selection
 * This should be called once after the ABC content is rendered
 */
function setupSelectionOverlay(): void {    // Add CSS to the document for selection styling
    if (!document.getElementById('selection-styles')) {        const style = document.createElement('style');
        style.id = 'selection-styles';
        style.textContent = `/*            .staff-dimming-overlay {
                fill: #888888;
                fill-opacity: 0;
                pointer-events: none;
                transition: fill-opacity 0.2s ease-in-out;
            }
              .selection-active .staff-dimming-overlay {
                fill-opacity: 0;
            }*/
              .selected-area {
                fill: transparent;
                pointer-events: none;
                stroke: #0078d7;
                stroke-width: 2;
                stroke-opacity: 0.8;
                transition: all 0.1s ease-out;
            }
            
            /* Make selected notes more visible by increasing opacity */
            .abcr {
                transition: opacity 0.1s ease-in-out;
            }
            
            /* Ensure selection highlights span full height */
            svg {
                position: relative;
            }            /* Uncomment for debugging selection issues: Visual indicator for selected notes */
            /*.abcr.selected {
                opacity: 1 !important;
                stroke: #ff0000;
                stroke-width: 1.5;
                stroke-opacity: 1;
                fill: rgba(255, 0, 0, 0.1) !important; /* Light red highlighting for selected notes */
            }*/
            
            /* When selection is active, dim unselected notes */
            .selection-active .abcr:not(.selected) {
                opacity: 0.3;
            }
        `;
        document.head.appendChild(style);
    }
    
    // Get all music SVG elements
    const svgElements = document.querySelectorAll('#sheet svg');
    
    // For each SVG (typically one per staff line)
    /*svgElements.forEach((svg, index) => {
        // Create the dimming overlay for the entire staff if it doesn't exist
        if (!svg.querySelector('.staff-dimming-overlay')) {
            const viewBox = svg.getAttribute('viewBox');
            if (!viewBox) return;
            
            const [, , width, height] = viewBox.split(' ').map(parseFloat);
            
            const dimmingOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            dimmingOverlay.setAttribute('class', 'staff-dimming-overlay staff-' + index);
            dimmingOverlay.setAttribute('x', '0');
            dimmingOverlay.setAttribute('y', '0');
            dimmingOverlay.setAttribute('width', width.toString());
            dimmingOverlay.setAttribute('height', height.toString());
            
            // Add to the SVG at the beginning so it's behind all content
            svg.insertBefore(dimmingOverlay, svg.firstChild);
        }
    });*/
}

/**
 * Manages the visual representation of selected notes using continuous blocks
 */
const selectionManager = {
    active: false,
    startIdx: 0,
    endIdx: 0,
    selectedAreas: [] as SVGElement[], // Stores references to selected area elements
    
    /**
     * Starts a new selection
     * @param idx Index of the first element to select
     */
    start(idx: number): void {
        if (!idx) return;
        
        this.clear(); // Clear any existing selection
        this.active = true;
        this.startIdx = idx;
        this.endIdx = idx;
        this.update();
        
        // Update selx array to maintain compatibility with playback
        setsel(0, idx);
        setsel(1, idx);
        
        // Send selection info to VS Code
        vscode.postMessage({ 
            command: 'selection', 
            start: idx, 
            stop: idx 
        });
    },
    
    /**
     * Updates the end of the selection
     * @param idx Index of the last element to select
     */
    end(idx: number): void {
        if (!this.active || !idx) return;
        
        this.endIdx = idx;
        this.update();
        
        // Update selx array
        setsel(1, idx);
        
        // Send updated selection to VS Code
        vscode.postMessage({ 
            command: 'selection', 
            start: this.startIdx, 
            stop: this.endIdx
        });
    },
    
    /**
     * Clears the current selection
     */    clear(): void {
        // Only proceed if there's an active selection
        if (!this.active) return;
        
        this.active = false;
        
        // Remove selection-active class from body to hide dimming overlays
        document.body.classList.remove('selection-active');
        
        // Remove any created selected area elements
        this.selectedAreas.forEach(element => {
            if (element && element.parentNode) {
                element.parentNode.removeChild(element);
            }
        });
        this.selectedAreas = [];
        
        // Reset selection state
        const minIdx = Math.min(this.startIdx, this.endIdx);
        const maxIdx = Math.max(this.startIdx, this.endIdx);
          // Restore original appearance of all abcr elements in the selection range
        for (let i = minIdx; i <= maxIdx; i++) {
            const elements = document.getElementsByClassName('_' + i + '_');
            for (let j = 0; j < elements.length; j++) {
                (elements[j] as HTMLElement).classList.remove('selected');
            }
        }
        
        // Reset selection state
        this.startIdx = 0;
        this.endIdx = 0;
        
        // Clear selx array
        selx[0] = 0;
        selx[1] = 0;
        
        // Show all dimming overlays (they'll be hidden since selection is inactive)
        document.querySelectorAll('.staff-dimming-overlay').forEach(overlay => {
            overlay.setAttribute('fill-opacity', '0');
        });
    },
    
    /**
     * Updates the visual representation of the selection
     * Creates continuous blocks spanning the entire height of each affected staff
     */    update(): void {
        if (!this.active) return;
        
        // Get the min and max indices for selection
        const minIdx = Math.min(this.startIdx, this.endIdx);
        const maxIdx = Math.max(this.startIdx, this.endIdx);
        
        // Clear any previous selected areas
        this.selectedAreas.forEach(element => {
            if (element && element.parentNode) {
                element.parentNode.removeChild(element);
            }
        });
        this.selectedAreas = [];            // Remove 'selected' class from all notes first
            document.querySelectorAll('.abcr').forEach(element => {
                element.classList.remove('selected');
            });
        
        // Add class to body to activate dimming overlays
        document.body.classList.add('selection-active');
        
        // Find all staff SVGs that contain selected notes
        const staffsWithSelection = new Map(); // Maps staff SVG to [minX, maxX] coordinates
        
        // Find left and right boundaries in each staff
        for (let i = minIdx; i <= maxIdx; i++) {
            const elements = document.getElementsByClassName('_' + i + '_');
            for (let j = 0; j < elements.length; j++) {
                const element = elements[j] as SVGRectElement;
                
                // Add 'selected' class to highlight this note in red
                element.classList.add('selected');
                
                // Find the parent SVG
                let parentSvg = element.parentElement;
                while (parentSvg && parentSvg.tagName !== 'svg') {
                    parentSvg = parentSvg.parentElement;
                }
                
                if (parentSvg) {
                    // Get x coordinate and width of this note
                    const x = parseFloat(element.getAttribute('x') || '0');
                    const width = parseFloat(element.getAttribute('width') || '0');
                    
                    // Store or update the min/max X coordinates for this staff
                    if (!staffsWithSelection.has(parentSvg)) {
                        staffsWithSelection.set(parentSvg, [x, x + width]);
                    } else {
                        const [minX, maxX] = staffsWithSelection.get(parentSvg);
                        staffsWithSelection.set(parentSvg, [
                            Math.min(minX, x),
                            Math.max(maxX, x + width)
                        ]);
                    }
                }
            }
        }          // Create selection blocks for each staff with selected notes
        staffsWithSelection.forEach((xRange, svg) => {
            // Get the viewBox to determine staff dimensions
            const viewBox = svg.getAttribute('viewBox');
            if (!viewBox) return;
            
            const [, , , height] = viewBox.split(' ').map(parseFloat);
              // Get all selected notes in this staff to calculate the exact area to highlight
            const selectedNotesInStaff = svg.querySelectorAll('.abcr.selected');
            if (selectedNotesInStaff.length === 0) return;
            
            // Instead of creating a big rectangle spanning all notes, let's create a path that connects
            // all the note rectangles for a more precise selection
            const firstNote = selectedNotesInStaff[0] as SVGRectElement;     

            // Find the parent group that contains all the note rectangles
            const noteParent = firstNote.parentElement;
            if (!noteParent) return;

            // create a function to extract recursively the scale factor from the factor of the scale attributes from all g ancestors
            // This is needed to correctly position the selection rectangle in the root SVG coordinate system
            var recursiveComputeXScale = (element: Element | null): number => {
                if (!element || element.tagName !== 'g') return 1;

                let xScale = 1;
                const transform = element.getAttribute('transform');
                if (transform) {
                    const match = transform.match(/scale\(\s*([0-9.]+)\s*(,\s*([0-9.]+)\s*)?\)/);
                    
                    if (match) {
                        xScale = parseFloat(match[1]);
                    }
                }
                
                const parent = element.parentElement;
                return recursiveComputeXScale(parent) * xScale;
            }

            let scaleX = recursiveComputeXScale(noteParent);
            
            // Get the positions and dimensions of the first note
            let minX = parseFloat(firstNote.getAttribute('x') || '0');
            let maxX = minX + parseFloat(firstNote.getAttribute('width') || '0');
            // Get the positions and dimensions of all notes to determine the exact bounding box
            const minY = 0;
            const maxY = height;
            
            selectedNotesInStaff.forEach((noteElement: SVGRectElement) => {
                const x: number = parseFloat(noteElement.getAttribute('x') || '0');
                const width: number = parseFloat(noteElement.getAttribute('width') || '0');

                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x + width);
            });

            // Adjust minX and maxX for the scale of the parent group
            minX *= scaleX;
            maxX *= scaleX;
            
            // Create a rectangle highlighting the selected area in this staff that matches 
            // the exact position of the notes
            const selectedArea = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            selectedArea.setAttribute('class', 'selected-area');
            
            // Use exact coordinates from the note rectangles (with a slight Y padding)
            const padding = 2;
            selectedArea.setAttribute('x', (minX).toString());
            selectedArea.setAttribute('y', (minY - padding).toString());
            selectedArea.setAttribute('width', ((maxX - minX)).toString());
            selectedArea.setAttribute('height', ((maxY - minY) + padding * 2).toString());

            // Add the selection rectangle as the first child of the svg element
            svg.insertBefore(selectedArea, svg.firstChild);
            
            this.selectedAreas.push(selectedArea);
        });
          // Set highlight on the selected notes for better visibility
        for (let i = minIdx; i <= maxIdx; i++) {
            const elements = document.getElementsByClassName('_' + i + '_');
            for (let j = 0; j < elements.length; j++) {
                (elements[j] as HTMLElement).classList.add('selected');
            }
        }
    }
};

// Track mouse state for selection
const mouseState = {
    isSelecting: false,
    lastIdx: 0
};

/**
 * Click event handler for the document
 * Detects clicks on musical elements and sends selection info back to VS Code
 */
document.addEventListener('click', event => {
    const target = event.target as Element;
    
    // Handle SVG and HTML elements differently for className
    let cls = '';
    if (target instanceof SVGElement) {
        // SVG elements have className.baseVal
        cls = (target as SVGElementWithClassName)?.className?.baseVal || '';
    } else {
        // Regular HTML elements have className as string
        cls = String(target?.className || '');
    }
    
    // If a selection marker was clicked, extract the start/stop positions
    // and send them back to VS Code to highlight the corresponding ABC text
    if (cls.startsWith('selMarker')) {
        const match = cls.match(/_(\d+)-(\d+)_/);
        if (match) {
            vscode.postMessage({ command: 'selection', start: +match[1], stop: +match[2] });
        }
    }
});

// Mouse down handler to start selection
document.addEventListener('mousedown', event => {
    const target = event.target as Element;
    
    // Handle SVG and HTML elements differently for className
    let cls = '';
    if (target instanceof SVGElement) {
        cls = (target as SVGElementWithClassName)?.className?.baseVal || '';
    } else {
        cls = String(target?.className || '');
    }
    
    // If a selection marker rectangle was clicked
    if (cls.startsWith('abcr')) {
        const match = cls.match(/_(\d+)_/);
        if (match) {
            const idx = +match[1];
            mouseState.isSelecting = true;
            mouseState.lastIdx = idx;
            selectionManager.start(idx);
            event.preventDefault();
        }
    } else if (selectionManager.active) {
        // Only clear selection if clicking on the music sheet area but not on a note
        // Check if the click is inside the sheet element but not on a button/control
        const sheetElement = document.getElementById('sheet');
        const isClickInsideSheet = sheetElement && sheetElement.contains(target);
        const isClickOnControl = target.tagName === 'BUTTON' || 
                                 target.closest('button') || 
                                 target.id === 'play-button' ||
                                 target.closest('#play-button');
        
        if (isClickInsideSheet && !isClickOnControl && !cls.includes('selected-area')) {
            selectionManager.clear();
        }
    }
});

// Mouse move handler for extending selection
document.addEventListener('mousemove', event => {
    if (!mouseState.isSelecting) return;
    
    // Find element under the pointer
    const element = document.elementFromPoint(event.clientX, event.clientY);
    if (!element) return;
    
    let cls = '';
    if (element instanceof SVGElement) {
        cls = (element as SVGElementWithClassName)?.className?.baseVal || '';
    } else {
        cls = String(element?.className || '');
    }
    
    if (cls.startsWith('abcr')) {
        const match = cls.match(/_(\d+)_/);
        if (match) {
            const idx = +match[1];
            if (idx !== mouseState.lastIdx) {
                mouseState.lastIdx = idx;
                selectionManager.end(idx);
            }
        }
    } else {
        // If moving over non-note element but still within selection area
        // Try to find the closest note element in the direction of movement
        
        // Get all note elements
        const noteElements = document.querySelectorAll('[class*="abcr"]');
        if (noteElements.length === 0) return;
        
        // Find closest note by comparing positions
        let closestElement = null;
        let closestDistance = Infinity;
        
        for (let i = 0; i < noteElements.length; i++) {
            const rect = noteElements[i].getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            // Calculate distance to mouse position
            const distance = Math.sqrt(
                Math.pow(centerX - event.clientX, 2) + 
                Math.pow(centerY - event.clientY, 2)
            );
            
            if (distance < closestDistance) {
                closestDistance = distance;
                closestElement = noteElements[i];
            }
        }
        
        // If we found a close note and it's reasonably near (within 100px)
        if (closestElement && closestDistance < 100) {
            cls = closestElement instanceof SVGElement 
                ? (closestElement as SVGElementWithClassName)?.className?.baseVal || ''
                : String(closestElement?.className || '');
                
            const match = cls.match(/_(\d+)_/);
            if (match) {
                const idx = +match[1];
                if (idx !== mouseState.lastIdx) {
                    mouseState.lastIdx = idx;
                    selectionManager.end(idx);
                }
            }
        }
    }
});

// Mouse up handler to complete selection
document.addEventListener('mouseup', () => {
    mouseState.isSelecting = false;
});

// Keyboard shortcuts for selection
document.addEventListener('keydown', (event) => {
    // Ctrl/Cmd+A for "Select All"
    if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
        event.preventDefault(); // Prevent default browser select all
        
        // Find the first and last note indices
        const noteElements = document.querySelectorAll('[class*="abcr"]');
        if (noteElements.length === 0) return;
        
        let firstIdx = Infinity;
        let lastIdx = 0;
        
        noteElements.forEach(element => {
            let cls = '';
            if (element instanceof SVGElement) {
                cls = (element as SVGElementWithClassName)?.className?.baseVal || '';
            } else {
                cls = String(element?.className || '');
            }
            
            const match = cls.match(/_(\d+)_/);
            if (match) {
                const idx = +match[1];
                firstIdx = Math.min(firstIdx, idx);
                lastIdx = Math.max(lastIdx, idx);
            }
        });
        
        // Select all notes from first to last
        if (firstIdx !== Infinity && lastIdx > 0) {
            selectionManager.start(firstIdx);
            selectionManager.end(lastIdx);
        }
    }
    
    // Escape key clears selection
    if (event.key === 'Escape' && selectionManager.active) {
        selectionManager.clear();
    }
});

/**
 * Event handler for the "Open in Web Editor" button
 * Compresses the current ABC content and opens it in Michael Eskin's online editor
 */
document.getElementById('open-web')?.addEventListener('click', () => {
    // Dynamically construct the URL
    const baseUrl = "https://michaeleskin.com/abctools/abctools.html";
    // Using LZString from the imported library to compress the ABC content
    const abcContent = LZString.compressToEncodedURIComponent(currentAbcContent);
    const queryParams = new URLSearchParams({
        lzw: abcContent,
        editor: "1"
    });
    const url = `${baseUrl}?${queryParams.toString()}`;

    // Send a message to VS Code to open the URL
    vscode.postMessage({
        command: "openLink",
        url: url
    });
});

/** PLAYBACK IMPLEMENTATION, WORK IN PROGRESS **/

/**
 * Event handler for the Play button
 * Initiates playback of the current ABC tune
 */
document.getElementById('play-button')?.addEventListener('click', (event) => {
    console.log('clicked on play');
    // Prevent the click from triggering document click handler
    event.stopPropagation();
    
    if (play.abcplay) {
        console.log('launching play');
        // If there's an active selection, play that, otherwise play the whole tune
        play_tune(selectionManager.active ? 1 : 0);
    }
});

/**
 * Start playing the ABC tune
 * @param what Playback mode: 0=Whole tune, 1=Selection, 2=Loop, 3=Continue
 * 
 * Workflow:
 * 1. Determine which musical symbols to play based on the mode and selection
 * 2. Configure the playback state
 * 3. Call play.abcplay.play() with the start and end symbols
 */
function play_tune(what: number): void {
    if (!abc)
        return;			// No generation yet
    
    const C = abc2svg.C;

    if (play.playing) {
        if (!play.stop) {
            play.stop = -1;
            play.abcplay?.stop();
        }
        return;
    }

    // Search a symbol to play
    function gnrn(sym: any, loop?: boolean): any {	// Go to the next real note (not tied)
        let i: number;
        while (true) {
            switch (sym.type) {
                case C.NOTE:
                    i = sym.nhd + 1;
                    while (--i >= 0) {
                        if (sym.notes[i].ti2)
                            break;
                    }
                    if (i < 0)
                        return sym;
                    break;
                case C.REST:
                case C.GRACE:
                    return sym;
                case C.BLOCK:
                    switch (sym.subtype) {
                        case "midictl":
                        case "midiprog":
                            return sym;
                    }
                    break;
            }
            if (!sym.ts_next) {
                if (!loop)
                    return gprn(sym, true);
                return sym;
            }
            sym = sym.ts_next;
        }
    }

    function gprn(sym: any, loop?: boolean): any {	// Go to the previous real note (not tied)
        let i: number;
        while (true) {
            switch (sym.type) {
                case C.NOTE:
                    i = sym.nhd + 1;
                    while (--i >= 0) {
                        if (sym.notes[i].ti2)
                            break;
                    }
                    if (i < 0)
                        return sym;
                    break;
                case C.REST:
                case C.GRACE:
                    return sym;
                case C.BLOCK:
                    switch (sym.subtype) {
                        case "midictl":
                        case "midiprog":
                            return sym;
                    }
                    break;
            }
            if (!sym.ts_prev) {
                if (!loop)
                    return gnrn(sym, true);
                return sym;
            }
            sym = sym.ts_prev;
        }
    }

    function gsot(si: number): any {		// Go to the first symbol of a tune
        let sym = syms[si].p_v.sym;

        while (!sym.seqst)
            sym = sym.ts_prev;
        return sym;
    }

    function get_se(si: number): any {			// Get the starting symbol
        let sym = syms[si];

        while (!sym.seqst)
            sym = sym.ts_prev;
        return sym;
    }

    function get_ee(si: number): any {			// Get the ending symbol
        let sym = syms[si];

        while (sym.ts_next && !sym.ts_next.seqst)
            sym = sym.ts_next;
        return sym;
    }

    /**
     * Start playback with the given start and end symbols
     * @param si Start symbol
     * @param ei End symbol
     * Output: Initiates MIDI playback through the AbcPlay instance
     */
    function play_start(si: any, ei: any): void {
        if (!si)
            return;
        selx_sav[0] = selx[0];		// Save current selection
        selx_sav[1] = selx[1];
        setsel(0, 0);               // Clear selection during playback
        setsel(1, 0);

        play.stop = 0;
        // Call the AbcPlay instance to start playback
        play.abcplay?.play(si, ei, play.repv);
    }

    play.playing = true;
    if (tunes != abc.tunes) {		// If new display
        tunes = abc.tunes;

        // Generate the play data of all tunes
        for (let i = 0; i < tunes.length; i++) {
            const elt = tunes[i];
            play.abcplay?.add(elt[0], elt[1], elt[3]);
        }

        play.si = play.ei = null;
        play.stop = 0;
        play.loop = false;
    }

    // If loop again
    if (what == 2 && play.loop) {
        play_start(play.si, play.ei);
        return;
    }    // Get the starting and ending play indexes, and start playing
    let si, ei;

    if (what == 3 && play.stop && play.stop > 0) {	// If stopped and continue
        play_start(get_se(play.stop), play.ei);
        return;
    }
    
    // Priority to the current selection if there is one
    if (selectionManager.active) {
        // Get the min and max indices for selection
        const minIdx = Math.min(selectionManager.startIdx, selectionManager.endIdx);
        const maxIdx = Math.max(selectionManager.startIdx, selectionManager.endIdx);
        
        // Update selx array based on the selection manager
        selx[0] = minIdx;
        selx[1] = maxIdx;
        
        si = get_se(minIdx);
        ei = get_ee(maxIdx);
        what = 1; // Always use selection mode if there's an active selection
    } else if (selx[0] && selx[1]) {
        si = get_se(selx[0]);
        ei = get_ee(selx[1]);
        what = 1; // Use selection mode
    } else if (what != 0 && selx[0]) {	// If selection without end
        si = get_se(selx[0]);
        ei = null;
    } else if (what != 0 && selx[1]) {	// If selection without start
        si = gsot(selx[1]);
        ei = get_ee(selx[1]);
    } else {				// No selection => tune
        // TODO: use the class name of the clicked element to get the tune number
        /* elt = play.click.svg		// (dummy)
        si = elt.getAttribute('class') */

        si = 'tune0'; // Dummy for tests
        const siMatch = /tune(\d*)/.exec(si);
        if (!siMatch) {
            play.playing = false;
            return;			// No tune here
        }
        si = tunes[parseInt(siMatch[1], 10)][0];		// First symbol of the tune
        ei = si;
        while (ei && !ei.dur)
            ei = ei.ts_next;
        if (!ei) {
            play.playing = false;
            return;			// Nothing to play
        }
        ei = null;
    }

    if (what != 3) {		// If not continue
        play.si = si;
        play.ei = ei;
        play.loop = what == 2;
        play.repv = 0;
    }

    play_start(si, ei);
}

/**
 * Set or clear a selection highlight
 * @param idx Selection index (0=start, 1=end)
 * @param v Element index to select, or 0 to clear
 * 
 * Output: Changes the fillOpacity of SVG elements to highlight/unhighlight
 */
function setsel(idx: number, v: number): void {
    const old_v = selx[idx];

    if (v == old_v)
        return;
        
    if (old_v) {
        // Only remove highlighting if we're not using the selection manager
        if (!selectionManager.active) {
            // Remove highlighting from previously selected elements
            const elts = document.getElementsByClassName('_' + old_v + '_');
            let i = elts.length;
            while (--i >= 0)
                (elts[i] as HTMLElement).style.fillOpacity = '0';
        }
    }
    
    if (v) {
        // Only add highlighting if we're not using the selection manager
        if (!selectionManager.active) {
            // Add highlighting to newly selected elements
            const elts = document.getElementsByClassName('_' + v + '_');
            let i = elts.length;
            while (--i >= 0)
                (elts[i] as HTMLElement).style.fillOpacity = '0.4';
        }
    }

    selx[idx] = v;
}

/**
 * Callback when playback is finished
 * @param repv Repeat variant number
 * 
 * Output: Updates UI state and restores previous selection
 */
function endplay(repv?: number): void {
    if (play.loop && play.abcplay) {
        play.abcplay.play(play.si, play.ei);
        return;
    }
    
    play.playing = false;
    play.repv = repv || 0;		// Repeat variant number for continue

    // Redisplay the selection
    selx[0] = selx[1] = 0;
    
    // If we had a selection manager active before playing, restore it
    if (selx_sav[0] && selx_sav[1]) {
        if (!selectionManager.active) {
            selectionManager.start(selx_sav[0]);
            selectionManager.end(selx_sav[1]);
        }
    } else {
        // Otherwise, just restore the old selection highlights
        setsel(0, selx_sav[0]);
        setsel(1, selx_sav[1]);
    }
}