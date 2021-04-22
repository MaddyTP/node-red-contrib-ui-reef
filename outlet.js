/**
 * Copyright 2021 Bart Butenaers & hotNipi
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

 module.exports = function(RED) {
    "use strict";
    var settings = RED.settings;
    var util = require("util");
    var vm = require("vm");

    function sendResults(node,send,_msgid,msgs,cloneFirstMessage) {
        if (msgs == null) {
            return;
        } else if (!util.isArray(msgs)) {
            msgs = [msgs];
        }
        var msgCount = 0;
        for (var m=0; m<msgs.length; m++) {
            if (msgs[m]) {
                if (!util.isArray(msgs[m])) {
                    msgs[m] = [msgs[m]];
                }
                for (var n=0; n < msgs[m].length; n++) {
                    var msg = msgs[m][n];
                    if (msg !== null && msg !== undefined) {
                        if (typeof msg === 'object' && !Buffer.isBuffer(msg) && !util.isArray(msg)) {
                            if (msgCount === 0 && cloneFirstMessage !== false) {
                                msgs[m][n] = RED.util.cloneMessage(msgs[m][n]);
                                msg = msgs[m][n];
                            }
                            msg._msgid = _msgid;
                            msgCount++;
                        } else {
                            var type = typeof msg;
                            if (type === 'object') {
                                type = Buffer.isBuffer(msg)?'Buffer':(util.isArray(msg)?'Array':'Date');
                            }
                            node.error(RED._("function.error.non-message-returned",{ type: type }));
                        }
                    }
                }
            }
        }
        if (msgCount>0) {
            send(msgs);
        }
    }

    function createVMOpt(node, kind) {
        var opt = {
            filename: 'Function node'+kind+':'+node.id+(node.name?' ['+node.name+']':''), // filename for stack traces
            displayErrors: true
            // Using the following options causes node 4/6 to not include the line number
            // in the stack output. So don't use them.
            // lineOffset: -11, // line number offset to be used for stack traces
            // columnOffset: 0, // column number offset to be used for stack traces
        };
        return opt;
    }

    function updateErrorInfo(err) {
        if (err.stack) {
            var stack = err.stack.toString();
            var m = /^([^:]+):([^:]+):(\d+).*/.exec(stack);
            if (m) {
                var line = parseInt(m[3]) -1;
                var kind = "body:";
                if (/setup/.exec(m[1])) {
                    kind = "setup:";
                }
                if (/cleanup/.exec(m[1])) {
                    kind = "cleanup:";
                }
                err.message += " ("+kind+"line "+line+")";
            }
        }
    }

    function HTML(config) { 
        // Replace the dots in the id (by underscores), because we use it in element identifiers.
        // And then dots are not allowed, because otherwise you cannot find the element by id!
        config.id = config.id.replace(".", "_");
        // Add a default rounding of 0em to older nodes (version 1.0.0)        
        // The configuration is a Javascript object, which needs to be converted to a JSON string
        var configAsJson = JSON.stringify(config);
        var html = String.raw`
        <style>
            .multistate-switch-container{
                display: block;
                width:100%;
                margin:auto;
                padding: 3px;
            }
            .multistate-switch-header{
                display: flex;
	            justify-content: space-between;
                font-size: 14px;
                font-weight: 500;
                letter-spacing: .1em;
                text-transform: uppercase;
                margin: 0.1em;
                padding-left: 2px;
                padding-right: 2px;
            }
            .multistate-switch-config{
                color: #999;
                cursor: pointer;
            }
            .multistate-switch-wrapper.disabled{
                border-color:gray;
                border-style:dashed;
            }
            .multistate-switch-wrapper{
                border:1px solid var(--nr-dashboard-widgetColor);
                display: flex;
                flex-flow: column nowrap;
                justify-content: center;
                align-items: center;
                position:relative;
                font-size: 14px;
                font-weight: 425;
                letter-spacing: .06em;
                text-transform: uppercase;
                margin: auto 0;
                width:100%;
                height: 1.55em;
            }
            .multistate-slider-wrapper.disabled{
                opacity:0.5;
            }
            .multistate-slider-wrapper{
                height: 1em;
                padding-top: 0.25em;
                padding-bottom: 0.25em;
                z-index:0
            }
            .multistate-switch-body.disabled{
                color:gray;
                pointer-events:none; 
            }
            .multistate-switch-body{
                pointer-events:auto;
                display: inline-flex;
                justify-content: flex-start;
                width: 100%;
            }
            .multistate-switch-slider-${config.id}{
                width: calc((100% - (${config.options.length} * 0.2em)) / ${config.options.length});
            }
            .multistate-switch-slider{                
                background-color: var(--nr-dashboard-widgetColor);
                position: absolute;
                height: 1.2em;
                transform: translate(0.1em, -0.25em);
                transition: all .4s ease;
                left: 0%;
                z-index:0;
            }
            .multistate-switch-button-${config.id}{
                width:calc(100% / ${config.options.length}); 
            }
            .multistate-switch-button.disabled{
                pointer-events:none !important;
            }
            .multistate-switch-button.dark{
                color:var(--nr-dashboard-widgetBgndColor)
            }
            .multistate-switch-button.light{
                color:var(--nr-dashboard-widgetTextColor)
            }
            .multistate-switch-button{              
               text-align:center;
               z-index:1;
               outline: none;
               user-select:none;
               cursor:pointer;
               line-height: 1.2em;
               transition: color 0.5s ease;
            }
            .multistate-switch-round{
                border-radius: 0.8em;
            }
        </style>
        <div class="multistate-switch-container" ng-init='init(` + configAsJson + `)'>
            <div ng-if="${config.label != ""}" class="multistate-switch-header">
                <div>${config.label}</div>
                <span>{{inputState}}</span>
            </div>
            <div id="multiStateSwitchContainer_` + config.id + `" class="multistate-switch-wrapper" ng-class="{'multistate-switch-round':(config.rounded)}">
                <div id="multiStateSwitchBody_` + config.id + `"" class="multistate-switch-body">
                    <div id="multiStateSwitchSliderWrapper_` + config.id + `" class="multistate-slider-wrapper">
                        <div id="multiStateSwitchSlider_` + config.id + `" class="multistate-switch-slider multistate-switch-slider-` + config.id + `" ng-class="{'multistate-switch-round':(config.rounded)}"></div>
                    </div>
                    <!-- The radio buttons will be inserted here dynamically on the frontend side -->
                </div>
            </div>
        </div>
        `;

        return html;
    }

    var ui = undefined;
    
    function OutletNode(config) {
        var node = this;
        if(ui === undefined) {
            ui = RED.require("node-red-dashboard")(RED);
        }
        config.dark = false
        if(typeof ui.isDark === "function"){
            config.dark = ui.isDark()
            config.widgetColor = ui.getTheme()['widget-backgroundColor'].value          
        }
        RED.nodes.createNode(this, config);
        node.name = config.name;
        node.func = config.func;
        node.outputs = config.outputs;
        node.ini = config.initialize ? config.initialize.trim() : "";
        node.fin = config.finalize ? config.finalize.trim() : "";
        var handleNodeDoneCall = true;

        if (/node\.done\s*\(\s*\)/.test(node.func)) {
            handleNodeDoneCall = false;
        }

        var functionText = "var results = null;"+
            "results = (async function(msg,__send__,__done__){ "+
                "var __msgid__ = msg._msgid;"+
                "var node = {"+
                    "id:__node__.id,"+
                    "name:__node__.name,"+
                    "outputCount:__node__.outputCount,"+
                    "log:__node__.log,"+
                    "error:__node__.error,"+
                    "warn:__node__.warn,"+
                    "debug:__node__.debug,"+
                    "trace:__node__.trace,"+
                    "on:__node__.on,"+
                    "status:__node__.status,"+
                    "send:function(msgs,cloneMsg){ __node__.send(__send__,__msgid__,msgs,cloneMsg);},"+
                    "done:__done__"+
                "};\n"+
                node.func+"\n"+
            "})(msg,__send__,__done__);";
        var finScript = null;
        var finOpt = null;
        node.topic = config.topic;
        node.outstandingTimers = [];
        node.outstandingIntervals = [];
        node.clearStatus = false;

        var sandbox = {
            console:console,
            util:util,
            Buffer:Buffer,
            Date: Date,
            RED: {
                util: RED.util
            },
            __node__: {
                id: node.id,
                name: node.name,
                outputCount: node.outputs,
                log: function() {
                    node.log.apply(node, arguments);
                },
                error: function() {
                    node.error.apply(node, arguments);
                },
                warn: function() {
                    node.warn.apply(node, arguments);
                },
                debug: function() {
                    node.debug.apply(node, arguments);
                },
                trace: function() {
                    node.trace.apply(node, arguments);
                },
                send: function(send, id, msgs, cloneMsg) {
                    sendResults(node, send, id, msgs, cloneMsg);
                },
                on: function() {
                    if (arguments[0] === "input") {
                        throw new Error(RED._("function.error.inputListener"));
                    }
                    node.on.apply(node, arguments);
                },
                status: function() {
                    node.clearStatus = true;
                    node.status.apply(node, arguments);
                }
            },
            context: {
                set: function() {
                    node.context().set.apply(node,arguments);
                },
                get: function() {
                    return node.context().get.apply(node,arguments);
                },
                keys: function() {
                    return node.context().keys.apply(node,arguments);
                },
                get global() {
                    return node.context().global;
                },
                get flow() {
                    return node.context().flow;
                }
            },
            flow: {
                set: function() {
                    node.context().flow.set.apply(node,arguments);
                },
                get: function() {
                    return node.context().flow.get.apply(node,arguments);
                },
                keys: function() {
                    return node.context().flow.keys.apply(node,arguments);
                }
            },
            global: {
                set: function() {
                    node.context().global.set.apply(node,arguments);
                },
                get: function() {
                    return node.context().global.get.apply(node,arguments);
                },
                keys: function() {
                    return node.context().global.keys.apply(node,arguments);
                }
            },
            env: {
                get: function(envVar) {
                    var flow = node._flow;
                    return flow.getSetting(envVar);
                }
            },
            setTimeout: function () {
                var func = arguments[0];
                var timerId;
                arguments[0] = function() {
                    sandbox.clearTimeout(timerId);
                    try {
                        func.apply(node,arguments);
                    } catch(err) {
                        node.error(err,{});
                    }
                };
                timerId = setTimeout.apply(node,arguments);
                node.outstandingTimers.push(timerId);
                return timerId;
            },
            clearTimeout: function(id) {
                clearTimeout(id);
                var index = node.outstandingTimers.indexOf(id);
                if (index > -1) {
                    node.outstandingTimers.splice(index,1);
                }
            },
            setInterval: function() {
                var func = arguments[0];
                var timerId;
                arguments[0] = function() {
                    try {
                        func.apply(node,arguments);
                    } catch(err) {
                        node.error(err,{});
                    }
                };
                timerId = setInterval.apply(node,arguments);
                node.outstandingIntervals.push(timerId);
                return timerId;
            },
            clearInterval: function(id) {
                clearInterval(id);
                var index = node.outstandingIntervals.indexOf(id);
                if (index > -1) {
                    node.outstandingIntervals.splice(index,1);
                }
            }
        };

        if (util.hasOwnProperty('promisify')) {
            sandbox.setTimeout[util.promisify.custom] = function(after, value) {
                return new Promise(function(resolve, reject) {
                    sandbox.setTimeout(function(){ resolve(value); }, after);
                });
            };
            sandbox.promisify = util.promisify;
        }

        const RESOLVING = 0;
        const RESOLVED = 1;
        const ERROR = 2;
        var state = RESOLVING;
        var messages = [];
        var processMessage = (() => {});

        var context = vm.createContext(sandbox);

        try {
            config.stateField = config.stateField || 'payload';
            config.enableField = config.enableField || 'enable';
            config.inputField = config.inputField || 'input';
            var html = HTML(config);
            var done = ui.addWidget({
                node: node,
                group: config.group,
                order: config.order, 
                width: config.width,
                height: config.height,
                format: html,
                templateScope: "local",
                emitOnlyNewValues: false,
                forwardInputMessages: false,
                storeFrontEndInputAsState: true,
                convertBack: function (value) {
                    return value;
                },
                beforeEmit: function(msg, value) {   
                    var newMsg = {};
                
                    if (msg) {
                        // Copy the socket id from the original input message. 
                        newMsg.socketid = msg.socketid;
                        
                        try {
                            // Get the new state value from the specified message field
                            newMsg.state = RED.util.getMessageProperty(msg, config.stateField || "payload");
                        } 
                        catch(err) {
                            // No problem because the state field is optional ...
                        }
                        
                        try {
                            // Get the new enable value from the specified message field
                            newMsg.enable = RED.util.getMessageProperty(msg, config.enableField);
                        } 
                        catch(err) {
                            // No problem because the enable value is optional ...
                        }

                        try {
                            // Get the new enable value from the specified message field
                            newMsg.input = RED.util.getMessageProperty(msg, config.inputField);
                        } 
                        catch(err) {
                            // No problem because the enable value is optional ...
                        }
                    }

                    return { msg: newMsg };
                },
                beforeSend: function (msg, orig) {
                    if (orig) {
                        var newMsg = {};
                        // Store the switch state in the specified msg state field
                        RED.util.setMessageProperty(newMsg, config.stateField, orig.msg.state, true)
                        //orig.msg = newMsg;
                        return newMsg;
                    }
                },
                initController: function($scope, events) {
                    $scope.flag = true;

                    $scope.init = function (config) {
                        $scope.config = config;

                        $scope.containerDiv = $("#multiStateSwitchContainer_" + config.id)[0];
                        $scope.sliderDivElement = $("#multiStateSwitchSlider_" + config.id)[0];
                        $scope.sliderWrapperElement = $("#multiStateSwitchSliderWrapper_" + config.id)[0];
                        
                        // Hide selected label when required (by showing slider on top of buttons)
                        if (config.hideSelectedLabel == true) {
                            // Use an inline style to apply this only to this node's slider
                            $scope.sliderWrapperElement.style.zIndex = 3;
                        }

                        // Get a reference to the sub-DIV element
                        var toggleRadioDiv = $scope.containerDiv.firstElementChild;

                        // Create all the required  button elements
                        config.options.forEach(function (option, index) {
                            var divElement = document.createElement("div");
                            divElement.setAttribute("class", "multistate-switch-button multistate-switch-button-"+config.id);
                            divElement.setAttribute("id", "mstbtn_"+config.id+"_"+index)
                            divElement.innerHTML = option.label;
                            divElement.addEventListener("click",  function() {
                                switchStateChanged(option.value, true);
                            });

                            toggleRadioDiv.appendChild(divElement);
                        });
                        // Make sure the initial element gets the correct color
                        switchStateChanged(config.options[0].value, false);
                    }

                    $scope.$watch('msg', function(msg) {
                        // Ignore undefined messages.
                        if (!msg) {
                            return;
                        }

                        //temporary added here to test the disable/enable functionality                            
                        if(msg.enable === true || msg.enable === false){
                            disable(!msg.enable);
                            return;
                        }

                        if (msg.state != undefined) {
                            switchStateChanged(msg.state, false);
                        }

                        if (msg.input != undefined) {
                            $scope.inputState = msg.input;
                        }
                    });

                    function disable(state){                            
                        //true - widget disabled, false - widget enabled
                        if(state == true){
                            $("#multiStateSwitchContainer_"+$scope.config.id).addClass('disabled')
                            $("#multiStateSwitchBody_"+$scope.config.id).addClass('disabled')                               
                            $("#multiStateSwitchSliderWrapper_"+$scope.config.id).addClass('disabled')
                            $scope.config.options.forEach(function (option, index) {
                                $("#mstbtn_"+$scope.config.id+"_"+index).addClass('disabled')
                            });
                        } else {
                            $("#multiStateSwitchContainer_"+$scope.config.id).removeClass('disabled')
                            $("#multiStateSwitchBody_"+$scope.config.id).removeClass('disabled')                               
                            $("#multiStateSwitchSliderWrapper_"+$scope.config.id).removeClass('disabled')
                            $scope.config.options.forEach(function (option, index) {
                                $("#mstbtn_"+$scope.config.id+"_"+index).removeClass('disabled')
                            });
                        }
                    }

                    function txtClassToStandOut(bgColor, light, dark) {
                        var color = (bgColor.charAt(0) === '#') ? bgColor.substring(1, 7) : bgColor;
                        var r = parseInt(color.substring(0, 2), 16);
                        var g = parseInt(color.substring(2, 4), 16);
                        var b = parseInt(color.substring(4, 6), 16);
                        var uicolors = [r / 255, g / 255, b / 255];
                        var c = uicolors.map((col) => {
                            if (col <= 0.03928) {
                            return col / 12.92;
                            }
                            return Math.pow((col + 0.055) / 1.055, 2.4);
                        });
                        var L = (0.2126 * c[0]) + (0.7152 * c[1]) + (0.0722 * c[2]);                           
                        if($scope.config.dark){
                            return (L > 0.35) ?  dark : light;
                        }
                        return (L > 0.35) ?  light : dark;
                    }
                            
                    function switchStateChanged(newValue, sendMsg) {
                        
                        var divIndex = -1;
                        // Try to find an option with a value identical to the specified value
                        // For every button be sure that button exists and change mouse cursor and pointer-events
                        $scope.config.options.forEach(function (option, index) {
                            if($("#mstbtn_"+$scope.config.id+"_"+index).length){                                    
                                $("#mstbtn_"+$scope.config.id+"_"+index).css({"cursor":"pointer","pointer-events":"auto"})
                                $("#mstbtn_"+$scope.config.id+"_"+index).removeClass("light dark")
                                if (option.value == newValue) {
                                    $("#mstbtn_"+$scope.config.id+"_"+index).css({"cursor":"default","pointer-events":"none"})
                                    var color = $scope.config.useThemeColors ? $scope.config.widgetColor : option.color ? option.color : $scope.config.widgetColor                                        
                                    $("#mstbtn_"+$scope.config.id+"_"+index).addClass(txtClassToStandOut(color,"light","dark"))
                                    divIndex = index;
                                }
                            }                               
                        });

                        if (divIndex >= 0) {
                            var percentage = "0%";
        
                            if ($scope.config.options.length > 0 && divIndex >= 0) {
                                percentage = (100 / $scope.config.options.length) * divIndex;
                                $scope.sliderDivElement.style.left = percentage + "%";
        
                                if ($scope.config.useThemeColors != true) {
                                    $scope.sliderDivElement.style.backgroundColor = $scope.config.options[divIndex].color;
                                }
                            }
                            
                            if ($scope.config.options[divIndex].valueType === "num") {
                                newValue = Number(newValue);
                            }

                            if ($scope.config.options[divIndex].valueType === "bool") {
                                if (newValue === 'true') {
                                    newValue = true;
                                } else {
                                    newValue = false;
                                }
                            }

                            if ($scope.config.optionsl[divIndex].valueType === 'auto') {
                                //function
                            }

                            if (sendMsg) {
                                $scope.send({ state: newValue });
                            }
                        } else {
                            console.log("No radio button has value '" + newValue + "'");
                        }
                    }
                }
            });

            var iniScript = null;
            var iniOpt = null;

            if (node.ini && (node.ini !== "")) {
                var iniText = `
                (async function(__send__) {
                    var node = {
                        id:__node__.id,
                        name:__node__.name,
                        outputCount:__node__.outputCount,
                        log:__node__.log,
                        error:__node__.error,
                        warn:__node__.warn,
                        debug:__node__.debug,
                        trace:__node__.trace,
                        status:__node__.status,
                        send: function(msgs, cloneMsg) {
                            __node__.send(__send__, RED.util.generateId(), msgs, cloneMsg);
                        }
                    };
                    `+ node.ini +`
                })(__initSend__);`;
                iniOpt = createVMOpt(node, " setup");
                iniScript = new vm.Script(iniText, iniOpt);
            }

            node.script = vm.createScript(functionText, createVMOpt(node, ""));

            if (node.fin && (node.fin !== "")) {
                var finText = `(function () {
                    var node = {
                        id:__node__.id,
                        name:__node__.name,
                        outputCount:__node__.outputCount,
                        log:__node__.log,
                        error:__node__.error,
                        warn:__node__.warn,
                        debug:__node__.debug,
                        trace:__node__.trace,
                        status:__node__.status,
                        send: function(msgs, cloneMsg) {
                            __node__.error("Cannot send from close function");
                        }
                    };
                    `+node.fin +`})();`;
                finOpt = createVMOpt(node, " cleanup");
                finScript = new vm.Script(finText, finOpt);
            }

            var promise = Promise.resolve();

            if (iniScript) {
                context.__initSend__ = function(msgs) { node.send(msgs); };
                promise = iniScript.runInContext(context, iniOpt);
            }

            processMessage = function (msg, send, done) {
                var start = process.hrtime();
                context.msg = msg;
                context.__send__ = send;
                context.__done__ = done;
                node.script.runInContext(context);
                context.results.then(function(results) {
                    sendResults(node,send,msg._msgid,results,false);
                    if (handleNodeDoneCall) {
                        done();
                    }
                    var duration = process.hrtime(start);
                    var converted = Math.floor((duration[0] * 1e9 + duration[1])/10000)/100;
                    node.metric("duration", msg, converted);
                    if (process.env.NODE_RED_FUNCTION_TIME) {
                        node.status({fill:"yellow",shape:"dot",text:""+converted});
                    }
                }).catch(err => {
                    if ((typeof err === "object") && err.hasOwnProperty("stack")) {
                        //remove unwanted part
                        var index = err.stack.search(/\n\s*at ContextifyScript.Script.runInContext/);
                        err.stack = err.stack.slice(0, index).split('\n').slice(0,-1).join('\n');
                        var stack = err.stack.split(/\r?\n/);

                        //store the error in msg to be used in flows
                        msg.error = err;

                        var line = 0;
                        var errorMessage;
                        if (stack.length > 0) {
                            while (line < stack.length && stack[line].indexOf("ReferenceError") !== 0) {
                                line++;
                            }

                            if (line < stack.length) {
                                errorMessage = stack[line];
                                var m = /:(\d+):(\d+)$/.exec(stack[line+1]);
                                if (m) {
                                    var lineno = Number(m[1])-1;
                                    var cha = m[2];
                                    errorMessage += " (line "+lineno+", col "+cha+")";
                                }
                            }
                        }
                        if (!errorMessage) {
                            errorMessage = err.toString();
                        }
                        done(errorMessage);
                    }
                    else if (typeof err === "string") {
                        done(err);
                    }
                    else {
                        done(JSON.stringify(err));
                    }
                });
            }

            promise.then(function (v) {
                var msgs = messages;
                messages = [];
                while (msgs.length > 0) {
                    msgs.forEach(function (s) {
                        processMessage(s.msg, s.send, s.done);
                    });
                    msgs = messages;
                    messages = [];
                }
                state = RESOLVED;
            }).catch((error) => {
                messages = [];
                state = ERROR;
                node.error(error);
            });
        } catch (e) {
            // Server side errors 
            updateErrorInfo(e);
            node.error(e);
            console.trace(e); // stacktrace
        }

        node.on("input", function(msg,send,done) {
            if(state === RESOLVING) {
                messages.push({msg:msg, send:send, done:done});
            }
            else if(state === RESOLVED) {
                processMessage(msg, send, done);
            }
        });

        node.on("close", function() {
            if (finScript) {
                try {
                    finScript.runInContext(context, finOpt);
                }
                catch (err) {
                    node.error(err);
                }
            }
            while (node.outstandingTimers.length > 0) {
                clearTimeout(node.outstandingTimers.pop());
            }
            while (node.outstandingIntervals.length > 0) {
                clearInterval(node.outstandingIntervals.pop());
            }
            if (node.clearStatus) {
                node.status({});
            }
            if (done) {
                done();
            }
        });

    }
    RED.nodes.registerType("outlet", OutletNode);
    RED.library.register("functions");
};
