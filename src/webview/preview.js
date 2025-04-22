const vscode = acquireVsCodeApi();
let play = {};
let abcEngine;

// callback called by abc2svg to load the modules it needs as part of its processing
abc2svg.loadjs = function (fn, relay, onerror) {
    let script = document.createElement('script');
    script.src = `${window.baseUri}/lib/${fn}`;
    script.type = 'text/javascript';
    if (relay)
        script.onload = relay;
    script.onerror = onerror || function () {
        console.log('error loading ' + fn)
    }
    document.head.appendChild(script);
    console.log('loaded module ' + fn);
}

// load snd-1.js for midi playback
abc2svg.loadjs("snd-1.js", function () {
    play.abcplay = AbcPlay({
        onend: {},
        onnote: {},
    });
});

// process messages received from the extension
window.addEventListener('message', event => {
    const msg = event.data;
    if (msg.command === 'render') {
        const content = msg.content;
        const div = document.getElementById('sheet');
        div.innerHTML = '';

        if (abc2svg) {
            let abc_images = '';
            const user = {
                img_out: s => abc_images += s,
                imagesize: 'width="100%"',
                errmsg: (msg, line, col) => {
                    vscode.postMessage({ command: 'error', message: msg, line, col });
                }
            };

            abcEngine = new abc2svg.Abc(user);
            if (abc2svg.modules.load(content, () => {
                abcEngine.tosvg('abc', content);
                div.innerHTML = abc_images;
            }, console.error)) {
                // modules were already loaded, callback won't be called
                abcEngine.tosvg('abc', content);
                div.innerHTML = abc_images;
            }
        }
    }
});

// implement playback
document.getElementById('play-button').addEventListener('click', () => {
    console.log('clicked on play');
    console.log(play.abcplay);
    console.log(abc2svg);
    console.log(abc2svg?.snd)
    if (!player && abc2svg?.snd) {
        console.log('creating player');
        const abc = document.getElementById('sheet').innerText;
        player = new abc2svg.snd(abc);
    }
    if (play.abcplay) {
        console.log('launching play');
        player.play();
    }
});

// TODO when clicking on a note, it selects the corresponding ABC
document.addEventListener('click', event => {
    const cls = String(event.target?.className?.baseVal || event.target?.className || '');
    if (cls.startsWith('selMarker')) {
        const match = cls.match(/_(\d+)-(\d+)_/);
        if (match) {
            vscode.postMessage({ command: 'selection', start: +match[1], stop: +match[2] });
        }
    }
});