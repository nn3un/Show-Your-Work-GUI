
//global variables
var log, content, index, order, paused, data, ordersAtIndices, highlightAtIndices, tokenAtIndices, playButton, pauseButton, fastForwardButton, slider, code, alert, speedDropDown, prevTime;

const msInASec =  1000, msInAMin = 60*1000, msInAHr = 60*60*1000, msInADay = 24*60*60*1000;



//Initialize the different DOM elements
document.addEventListener("DOMContentLoaded", function(event) { 
    playButton        = document.getElementById("play");
    pauseButton       = document.getElementById("pause");
    fastForwardButton = document.getElementById("fastForward");
    slider            = document.getElementById("slider");
    alert             = document.getElementById("alert");
    code              = document.querySelector("code");
    speedDropDown     = document.getElementById("speed");

    window.addEventListener("keydown", function checkKeyPressed(e) {
        if (e.key == " ") {
            fastForward();
        }
    }, false);
    
});

function fastForward(){
    slider.value = parseInt(slider.value) + 10;
    sliderChanged();
};


//The event listener for the open file
function openFile() {
    pause();
    var input = event.target;
    var reader = new FileReader();
    reader.onload = function(){
        //initialize all the necessary global variables
        log                        = reader.result;
        data                       = CSVToArray(log);
        playButton.disabled        = false;
        fastForwardButton.disabled = false;
        slider.disabled            = false;
        paused                     = true;
        content                    = " ";
        code.innerHTML             = "";
        ordersAtIndices            = []
        highlightAtIndices         = []
        tokenAtIndices             = []
        slider.value               = 0;
        slider.max                 = data.length-1;
        index                      = 0;
        order                      = 0;
        prevTime                   = 0;
        updateSliderAppearance();
    };
    reader.readAsText(input.files[0]);
    
};

var re_comment  = /(#[^\n]*)/;
var re_string   = /((?:\br?b|\bbr)?"""(?:[^"\\]|\\[\s\S]|""?(?=[^"]))*"""|(?:r?b|br)?'''(?:[^'\\]|\\[\s\S]|''?(?=[^']))*'''|(?:r?b|br)?"(?:[^"\\\n]|\\[\s\S])*"|(?:r?b|br)?'(?:[^'\\\n]|\\[\s\S])*')/;
var re_number   = /\b((?:[0-9]*\.[0-9]+(?:[eE][-+][0-9]+)?|[0-9]+\.(?:[eE][-+][0-9]+)?|[0-9]+[eE][-+][0-9]+|0[Bb][01]+|0[Oo][0-7]+|0[Xx][0-9a-fA-F]+|0|[1-9][0-9]*)[jJ]?)\b/;
var re_keyword  = /\b(elif|global|as|if|from|raise|for|except|finally|import|pass|return|else|break|with|class|assert|yield|try|while|continue|del|def|lambda|nonlocal|and|is|in|not|or|None|True|False)\b/;
var tokenizer   = new RegExp([re_comment.source, re_string.source, re_number.source, re_keyword.source].join('|'), 'g');
var token_types = [null, 'comment', 'string', 'number', 'keyword'];

function htmlspecialchars(s) {
    return s.replace(/\&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')
}


async function play(){
    paused = false; //Set paused to false
    pauseButton.disabled = false; //Enable the pause button
    playButton.disabled = true; //Disable the play button
    //The local variables
    var entry, time, type, offset, toChange, htmlToDisplay, currentInd, indAtContent, interval;
    //We're going to start at the current index denoted by the slider, since the user can change slider postion
    index = parseInt(slider.value);
    //initialize everything so we can catch up
    content = " ";
    order = 0;
    ordersAtIndices = [];
    tokenAtIndices  = [];
    //todo: try once more to implement catchUp from old index to new index, instead of starting from 0
    catchUp(0, index);

    //Set prevTime to be the time from the last index
    prevTime = index > 0 ? data[index-1][0] : data[0][0];
    //Loop through the data
    for(i = index; i < data.length; i++){
        if(paused){
            //If the pause button has been pressed we must stop
            index = i;
            break;
        }
        //Gather the data: time, type, offset and current string
        entry = data[i];
        [time, type, offset, toChange] = [parseInt(entry[0]), entry[1], parseInt(entry[2]), entry[3]];
        //Update content and the array orderAtIndices with the new entry information
        updateContentAndOrders(i, time, type, offset, toChange);
        updateTokens();
        //Figure out what should be displayed
        [oldHtmlToDisplay, htmlToDisplay] = getHtmlsToDisplay(offset, type, toChange);
        //Find out how much time should be spent showing transitions
        interval = getInterval(time, prevTime);
        //If we've deleted we're going to show the most-recent html with the part being deleted highlighted first
        if(type == "sub") displayHtmlInCode(oldHtmlToDisplay)
        //wait a few ms so that the user can see the transition
        await sleep(interval);
        alert.style.display = "none"; //hide the alert if it's not hidden
        //Now show the html
        displayHtmlInCode(htmlToDisplay)
        //Update prevTime and slider.value
        prevTime = time; 
        slider.value = i+1;
        updateSliderAppearance();
    }
}

function pause(){
    paused = true;
    pauseButton.disabled = true;
    playButton.disabled = false;
}

function getInterval(time, prevTime){
    //Get the speed, divide by the time passed to get how fast you should move on to the next iteration of the loop
    var speed = parseFloat(speedDropDown.value);
    var interval = (time-prevTime)/speed;
    //If the time is greater than 2 seconds, we're going to fast forward
    if (interval > 2000){
        alert.innerText = getInterval(time-prevTime) + " >> "; //Update the alert div, so it shows how much we moved forward 
        alert.style.display = "block"; //Immediately hide it
        interval = 1000; //Set the new interval to be a second
    }
    return interval
}

function getHtmlsToDisplay(offset, type, toChange){
    var currentInd    = 0; //currentInd in the order array
    var indAtContent  = 0; //index to track where we are in the code content
    var oldHtmlToDisplay = ""; //Initialize what the output was displaying
    var htmlToDisplay    = "";//Initialize what the output would display
    //Loop through the entire content
    while(indAtContent < content.length){
        //We want to be able to highlight the portion we're changing so let's check if we're there
        if(indAtContent == offset){
            //if we're adding then the process is straightforward, in our htmlToDisplay, the currentColor of the added string will be blue
            if(type == 'add'){
                currentString = content.substring(offset, offset+toChange.length);
                currentInd += toChange.length;
                indAtContent += toChange.length;
                htmlToDisplay += "<span class='modified'>" + currentString + "</span>";
                continue; //No more highlighting needed for this portion, since too much coloring will look bad
            }
            //If instead we'er deleting we'll show the old text first, and then show the new text. when we're showing the old text we'll highlight the part that will be deleted
            else if (type=='sub'){
                oldHtmlToDisplay += "<span class='modified'>" + toChange + "</span>";
            }
        }

        //Get the currentString and currentOrder
        var currentString = content[indAtContent];
        if(tokenAtIndices[indAtContent]){
            currentString = '<span class="'+tokenAtIndices[indAtContent]+'">'+content[indAtContent]+'</span>';
        }
        var currentOrder = ordersAtIndices[currentInd];
        currentInd++;
        indAtContent++;
        //There might be indices next to each other with the same order, if so it's more efficient to concatanate them together before applying a span style. 
        while(currentInd < ordersAtIndices.length && indAtContent < content.length && ordersAtIndices[currentInd] === currentOrder){
            if(tokenAtIndices[indAtContent]){
                //This is where syntax highligting is being applied based on the token
                currentString += '<span class="'+tokenAtIndices[indAtContent]+'">'+content[indAtContent]+'</span>';
            }
            else{
                currentString += content[indAtContent];
            }
            currentInd++;
            indAtContent++;
        }
        //This is where the order-based highlighting is applied
        var htmlToAdd = "<span style='background-color: " + numberToColorHsl(currentOrder*100/order) + "'>" + currentString + "</span>";
        //add the new text to the htmls
        htmlToDisplay += htmlToAdd;
        oldHtmlToDisplay += htmlToAdd;
    }
    return [oldHtmlToDisplay, htmlToDisplay]
}

async function displayHtmlInCode(html){
    var lines = html.split('\n');
    var wid = String(lines.length).length;
    var src = '';
    //figure out why lieno is not working properly
    for(var j=0; j<lines.length; j+=1) {
        src += '<span class="lineno">'+String(j+1).padStart(wid)+'</span>' + lines[j] + '\n';
    }
    code.innerHTML = src
    //Scroll to the position where the edit happened
    var modified = document.querySelector('.modified');
    if(modified && !isScrolledIntoView(modified)){
        await sleep(500); //sleep a little so the scrolling doesn't seem sudden
        modified.scrollIntoView();
    }
}

function getInterval(milisecond){
    if(milisecond <= msInAMin){
        return Math.round(milisecond/msInASec, 2) + " sec";
    }
    else if (milisecond <= msInAHr){
        return Math.round(milisecond/msInAMin, 2) + " min";
    }
    else if (milisecond <= msInADay){
        return Math.round(milisecond/msInAHr, 2) + " hour";
    }
    else{
        return Math.round(milisecond/msInADay, 2) + " day";
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function updateContentAndOrders(ind, time, type, offset, toChange){
    if (type === "add"){
        //If it was an add update the content, and for the orderAtIndices array update the order at those specific indices
        Array.from(toChange).forEach(function(item, index){
           ordersAtIndices.splice(offset+index, 0, order); 
        })
        content = content.substring(0, offset) + toChange + content.substring(offset);
        order++;
    }
    else if (type === "sub"){
        //else delete the orders at those indices
        Array.from(toChange).forEach(function(item, index){
           ordersAtIndices.splice(offset+index, 1);
        })
        content = content.substring(0, offset) + content.substring(offset + toChange.length); 
    }
    else{
        console.log("eof?")
        console.log(data[ind])
    }
}

//https://github.com/tychonievich/archimedes/blob/master/view.php
function updateTokens(){
    var bits = content.split(tokenizer);
    var helperIndex = 0;
    for(var j=0; j<bits.length; j+=token_types.length) {
        //If the current bit is a specialcharacter then we won't apply any styles. so just put null as token type
        for(var l = 0; l < bits[j].length; l++){
            tokenAtIndices[helperIndex] = null;
            helperIndex++;
        }
        if (j+1 == bits.length) break;
        for(var k=1; k<token_types.length; k+=1){
            if (bits[j+k]) {
                for(var l = 0; l < bits[j+k].length; l++){
                    tokenAtIndices[helperIndex] = token_types[k];
                    helperIndex++;
                }       
            }
        }                 
    }
}

function catchUp(oldIndex, newIndex){
    //This works with fast forward, instead of updating the view, we just update content and the order array. 
    for(i = oldIndex; i < newIndex; i++){
        var entry = data[i];
        var [time, type, offset, toChange] = [parseInt(entry[0]), entry[1], parseInt(entry[2]), entry[3]];
        updateContentAndOrders(i, time, type, offset, toChange);
    }
}

function sliderChanged(){
    updateSliderAppearance();
    //when the slider changed, and we are paused we can just re-iterate what happens when a pause and a play happen, since that way play is forced to start from the current slider position
    if(!paused){
        pause();
        play();
    }
    //if we are paused then we will just fast forward to the time indicated by the timer
    else{
        index = parseInt(slider.value);
        //initialize everything so we can catch up
        content = " ";
        order = 0;
        ordersAtIndices = [];
        tokenAtIndices  = [];
        catchUp(0, index);
        updateTokens();
        //get the entry that catchUp stopped at
        var stoppedAtEntry = data[Math.max(index-1, 0)];
        var [stoppedAtOffset, stoppedAtType, stoppedAtToChange] = [stoppedAtEntry[1], stoppedAtEntry[2], stoppedAtEntry[3]]
        var [oldhtmlToDisplay, htmlToDisplay] = getHtmlsToDisplay(stoppedAtOffset, stoppedAtType,stoppedAtToChange)
        displayHtmlInCode(oldhtmlToDisplay) //displaying this in hope of .modified to show up
        displayHtmlInCode(htmlToDisplay)
    }
}

//https://jsfiddle.net/4zxm7fw0/436/
function updateSliderAppearance(){
    var value = parseInt(slider.value) / parseInt(slider.max);
    var percent = value * 100;
    slider.style.backgroundImage = '-webkit-gradient(linear, left top, right top, ' +
        'color-stop(' + percent + '%, #df7164), ' +
        'color-stop(' + percent + '%, #F5D0CC))';
}

// https://www.bennadel.com/blog/1504-ask-ben-parsing-csv-strings-with-javascript-exec-regular-expression-command.htm
function CSVToArray( strData, strDelimiter ){
        strDelimiter = (strDelimiter || ",");
        var objPattern = new RegExp(
            (
                // Delimiters.
                "(\\" + strDelimiter + "|\\r?\\n|\\r|^)" +
                // Quoted fields.
                "(?:\"([^\"]*(?:\"\"[^\"]*)*)\"|" +
                // Standard fields.
                "([^\"\\" + strDelimiter + "\\r\\n]*))"
            ),
            "gi"
            );
        var arrData = [[]];
        var arrMatches = null;
        var previousTime, currentTime;
        while (arrMatches = objPattern.exec( strData )){
            var strMatchedDelimiter = arrMatches[ 1 ];
            if (
                strMatchedDelimiter.length &&
                (strMatchedDelimiter != strDelimiter)
                ){
                arrData.push( [] );
            }
            if (arrMatches[ 2 ]){
                var strMatchedValue = arrMatches[ 2 ].replace(
                    new RegExp( "\"\"", "g" ),
                    "\""
                    );
            } else {
                var strMatchedValue = arrMatches[ 3 ];
            }
            arrData[ arrData.length - 1 ].push( strMatchedValue );
        }
        return( arrData );
}

//------------------------------------------------------------------------------------//
//https://stackoverflow.com/questions/17525215/calculate-color-values-from-green-to-red

// convert a number to a color using hsl
function numberToColorHsl(i) {
    var hue = i * 1.2 / 360;
    var rgb = hslToRgb(hue, 1, .8);
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ', 0.5)'; 
}

function hslToRgb(h, s, l){
    var r, g, b;

    if(s == 0){
        r = g = b = l; // achromatic
    }else{
        function hue2rgb(p, q, t){
            if(t < 0) t += 1;
            if(t > 1) t -= 1;
            if(t < 1/6) return p + (q - p) * 6 * t;
            if(t < 1/2) return q;
            if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        }

        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }

    return [Math.floor(r * 255), Math.floor(g * 255), Math.floor(b * 255)];
}
//------------------------------------------------------------------------------------//



//https://stackoverflow.com/questions/487073/check-if-element-is-visible-after-scrolling
function isScrolledIntoView(el) {
    var rect = el.getBoundingClientRect();
    var elemTop = rect.top;
    var elemBottom = rect.bottom;
    var isVisible = (elemTop >= 20) && (elemBottom <= .6*window.innerHeight);
    return isVisible;
}


/*
Possible improvements:
1. Use gap buffer to increase the playback efficiency
2. Keep track of current minimum order value, so that if a person types everything deletes them and starts again, everything doesn't look green
3. Cross-browser support??
4. Add smooth scrolling
*/
    