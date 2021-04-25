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
 * */

module.exports = function (RED) {
    var util = require("util");
    var vm = require("vm");

    function HTML(config) {
        config.id = config.id.replace(".", "_");
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
              <div>
                  <span>{{inputState}}</span>
                  <i class="fa fa-cog multistate-switch-config"></i>
              </div>
          </div>
          <div id="multiStateSwitchContainer_` + config.id + `" class="multistate-switch-wrapper multistate-switch-round">
              <div id="multiStateSwitchBody_` + config.id + `"" class="multistate-switch-body">
                  <div id="multiStateSwitchSliderWrapper_` + config.id + `" class="multistate-slider-wrapper">
                      <div id="multiStateSwitchSlider_` + config.id + `" class="multistate-switch-slider multistate-switch-round multistate-switch-slider-` + config.id + `"></div>
                  </div>
                  <!-- The radio buttons will be inserted here dynamically on the frontend side -->
              </div>
          </div>
      </div>
      `;

        return html;
    }

    //functionx
    var npm = require("npm");
    var events = require("events");
    var strip = require("strip-comments");
    const { npmInstallTo } = require("npm-install-to");
    var temp = require("temp").track();

    var tempDir = temp.mkdirSync();
    var tempNodeModulesPath = tempDir + "/node_modules/";

    function sendResults(node, send, msg) {
        if (msgs == null) {
            return;
        }
        if (msg !== null && msg !== undefined) {
            var type = typeof msg;
            if (type === 'object') {
                type = Buffer.isBuffer(msg) ? 'Buffer' : (msg.isArray() ? 'Array' : 'Date');
            }
            node.error(RED._("node-red:function.error.non-message-returned", { type: type }));
        }
        send(msg);
    }

    function createVMOpt(node, kind) {
        var opt = {
            filename: 'Function node' + kind + ':' + node.id + (node.name ? ' [' + node.name + ']' : ''), // filename for stack traces
            displayErrors: true
        };
        return opt;
    }

    function updateErrorInfo(err) {
        if (err.stack) {
            var stack = err.stack.toString();
            var m = /^([^:]+):([^:]+):(\d+).*/.exec(stack);
            if (m) {
                var line = parseInt(m[3]) - 1;
                var kind = "body:";
                if (/setup/.exec(m[1])) {
                    kind = "setup:";
                }
                if (/cleanup/.exec(m[1])) {
                    kind = "cleanup:";
                }
                err.message += " (" + kind + "line " + line + ")";
            }
        }
    }

    function OutletNode(config) {
        try {
            var ui = RED.require("node-red-dashboard")(RED);
            config.dark = false
            if (typeof ui.isDark === "function") {
                config.dark = ui.isDark()
                config.widgetColor = ui.getTheme()['widget-backgroundColor'].value
            }
            RED.nodes.createNode(this, config);
            var node = this;

            config.initState = node.context().get('state');
            if (config.initState === undefined) {
                config.initState = config.options[0].value;
            };

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
                beforeEmit: function (msg, value) {
                    var newMsg = {};
                    if (msg) {
                        newMsg.socketid = msg.socketid;
                        newMsg.state = RED.util.getMessageProperty(msg, config.stateField || 'payload');
                        newMsg.input = RED.util.getMessageProperty(msg, config.inputField || 'input');
                    }
                    return { msg: newMsg };
                },
                beforeSend: function (msg, orig) {
                    if (orig) {
                        var newMsg = {};
                        RED.util.setMessageProperty(newMsg, config.stateField, orig.msg.state, true);
                        if (config.storestate) { node.context().set('state', orig.msg.state.toString()) };
                        return newMsg;
                    }
                },
                initController: function ($scope, events) {
                    $scope.flag = true;
                    $scope.init = function (config) {
                        $scope.config = config;
                        $scope.containerDiv = $("#multiStateSwitchContainer_" + config.id)[0];
                        $scope.sliderDivElement = $("#multiStateSwitchSlider_" + config.id)[0];
                        $scope.sliderWrapperElement = $("#multiStateSwitchSliderWrapper_" + config.id)[0];
                        // Get a reference to the sub-DIV element
                        var toggleRadioDiv = $scope.containerDiv.firstElementChild;
                        // Create all the required  button elements
                        config.options.forEach(function (option, index) {
                            var divElement = document.createElement("div");
                            divElement.setAttribute("class", "multistate-switch-button multistate-switch-button-" + config.id);
                            divElement.setAttribute("id", "mstbtn_" + config.id + "_" + index)
                            divElement.innerHTML = option.label;
                            divElement.addEventListener("click", function () {
                                switchStateChanged(option.value, true);
                            });
                            toggleRadioDiv.appendChild(divElement);
                        });
                        // Make sure the initial element gets the correct color
                        switchStateChanged(config.options[0].value, false);
                    }
                    $scope.$watch('msg', function (msg) {
                        // Ignore undefined messages.
                        if (!msg) {
                            return;
                        }
                        if (msg.state !== undefined) {
                            switchStateChanged(msg.state.toString(), false);
                        }
                        if (msg.input !== undefined) {
                            $scope.inputState = msg.input;
                        }
                    });

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
                        if ($scope.config.dark) {
                            return (L > 0.35) ? dark : light;
                        }
                        return (L > 0.35) ? light : dark;
                    }

                    function switchStateChanged(newValue, sendMsg) {
                        var divIndex = -1;
                        // Try to find an option with a value identical to the specified value
                        // For every button be sure that button exists and change mouse cursor and pointer-events
                        $scope.config.options.forEach(function (option, index) {
                            if ($("#mstbtn_" + $scope.config.id + "_" + index).length) {
                                $("#mstbtn_" + $scope.config.id + "_" + index).css({ "cursor": "pointer", "pointer-events": "auto" })
                                $("#mstbtn_" + $scope.config.id + "_" + index).removeClass("light dark")
                                if (option.value == newValue) {
                                    // selected button inactive                                                                                                                     
                                    $("#mstbtn_" + $scope.config.id + "_" + index).css({ "cursor": "default", "pointer-events": "none" })
                                    // ensure the button text stand out
                                    var color = $scope.config.useThemeColors ? $scope.config.widgetColor : option.color ? option.color : $scope.config.widgetColor
                                    $("#mstbtn_" + $scope.config.id + "_" + index).addClass(txtClassToStandOut(color, "light", "dark"))
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
                            if (sendMsg) {
                                $scope.send({ state: newValue });
                            }
                        }
                        else {
                            console.log("No radio button has value '" + newValue + "'");
                        }
                    }
                }
            });

            //functionx
            node.name = config.name;
            node.func = config.func;

            var handleNodeDoneCall = true;

            if (/node\.done\s*\(\s*\)/.test(node.func)) {
                handleNodeDoneCall = false;
            }

            var functionText = "var results = null;" +
                "results = (async function(msg,__send__,__done__){ " +
                "var __msgid__ = msg._msgid;" +
                "var node = {" +
                "id:__node__.id," +
                "name:__node__.name," +
                "log:__node__.log," +
                "error:__node__.error," +
                "warn:__node__.warn," +
                "debug:__node__.debug," +
                "trace:__node__.trace," +
                "on:__node__.on," +
                "status:__node__.status," +
                "send:function(msgs,cloneMsg){ __node__.send(__send__,msg);}," +
                "done:__done__" +
                "};\n" +
                node.func + "\n" +
                "})(msg,__send__,__done__);";

            node.outstandingTimers = [];
            node.outstandingIntervals = [];
            node.clearStatus = false;

            var sandbox = {
                console: console,
                util: util,
                Buffer: Buffer,
                Date: Date,
                RED: {
                    util: RED.util
                },
                __node__: {
                    id: node.id,
                    name: node.name,
                    log: function () {
                        node.log.apply(node, arguments);
                    },
                    error: function () {
                        node.error.apply(node, arguments);
                    },
                    warn: function () {
                        node.warn.apply(node, arguments);
                    },
                    debug: function () {
                        node.debug.apply(node, arguments);
                    },
                    trace: function () {
                        node.trace.apply(node, arguments);
                    },
                    send: function (send, msg) {
                        sendResults(node, send, msg);
                    },
                    on: function () {
                        if (arguments[0] === "input") {
                            throw new Error(RED._("node-red:function.error.inputListener"));
                        }
                        node.on.apply(node, arguments);
                    },
                    status: function () {
                        node.clearStatus = true;
                        node.status.apply(node, arguments);
                    }
                },
                context: {
                    set: function () {
                        node.context().set.apply(node, arguments);
                    },
                    get: function () {
                        return node.context().get.apply(node, arguments);
                    },
                    keys: function () {
                        return node.context().keys.apply(node, arguments);
                    },
                    get global() {
                        return node.context().global;
                    },
                    get flow() {
                        return node.context().flow;
                    }
                },
                flow: {
                    set: function () {
                        node.context().flow.set.apply(node, arguments);
                    },
                    get: function () {
                        return node.context().flow.get.apply(node, arguments);
                    },
                    keys: function () {
                        return node.context().flow.keys.apply(node, arguments);
                    }
                },
                global: {
                    set: function () {
                        node.context().global.set.apply(node, arguments);
                    },
                    get: function () {
                        return node.context().global.get.apply(node, arguments);
                    },
                    keys: function () {
                        return node.context().global.keys.apply(node, arguments);
                    }
                },
                env: {
                    get: function (envVar) {
                        var flow = node._flow;
                        return flow.getSetting(envVar);
                    }
                },
                setTimeout: function () {
                    var func = arguments[0];
                    var timerId;
                    arguments[0] = function () {
                        sandbox.clearTimeout(timerId);
                        try {
                            func.apply(node, arguments);
                        } catch (err) {
                            node.error(err, {});
                        }
                    };
                    timerId = setTimeout.apply(node, arguments);
                    node.outstandingTimers.push(timerId);
                    return timerId;
                },
                clearTimeout: function (id) {
                    clearTimeout(id);
                    var index = node.outstandingTimers.indexOf(id);
                    if (index > -1) {
                        node.outstandingTimers.splice(index, 1);
                    }
                },
                setInterval: function () {
                    var func = arguments[0];
                    var timerId;
                    arguments[0] = function () {
                        try {
                            func.apply(node, arguments);
                        } catch (err) {
                            node.error(err, {});
                        }
                    };
                    timerId = setInterval.apply(node, arguments);
                    node.outstandingIntervals.push(timerId);
                    return timerId;
                },
                clearInterval: function (id) {
                    clearInterval(id);
                    var index = node.outstandingIntervals.indexOf(id);
                    if (index > -1) {
                        node.outstandingIntervals.splice(index, 1);
                    }
                }
            };

            if (util.hasOwnProperty('promisify')) {
                sandbox.setTimeout[util.promisify.custom] = function (after, value) {
                    return new Promise(function (resolve, reject) {
                        sandbox.setTimeout(function () { resolve(value); }, after);
                    });
                };
                sandbox.promisify = util.promisify;
            }

            var requiredModules = [];
            var installedModules = {};
            var npmModules = {};
            const RE_SCOPED = /^(@[^/]+\/[^/@]+)(?:\/([^@]+))?(?:@([\s\S]+))?/;
            const RE_NORMAL = /^([^/@]+)(?:\/([^@]+))?(?:@([\s\S]+))?/;
            var pattern = /require\(([^)]+)\)/g
            var functionTextwoComments = strip(functionText);
            var result = pattern.exec(functionTextwoComments);

            while (result != null) {
                var module_name = result[1];
                module_name = module_name.replace(/'/g, "");
                module_name = module_name.replace(/"/g, "");
                var matched = module_name.charAt(0) === "@" ? module_name.match(RE_SCOPED) : module_name.match(RE_NORMAL);
                var moduleNameOnly = matched[1];
                var modulePath = matched[2] || '';
                var moduleVersion = matched[3] || '';
                requiredModules.push({ name: moduleNameOnly, path: modulePath, version: moduleVersion, fullName: module_name });
                result = pattern.exec(functionTextwoComments);
            }

            var setStatus = function (errors, itemsProcessed) {
                if (itemsProcessed === requiredModules.length) {
                    if (errors.length === 0) {
                        node.status({ fill: "green", shape: "dot", text: "ready" });
                        setTimeout(node.status.bind(node, {}), 5000);
                    }
                    else {
                        var msg = errors.length.toString() + " package(s) installations failed.";
                        errors.forEach(function (e) {
                            msg = msg + "\r\n" + e.moduleName;
                        });
                        node.status({ fill: "red", shape: "dot", text: msg });
                    }
                }
            };

            var errors = [];
            var itemsProcessed = 0;

            requiredModules.forEach(function (npmModule) {
                var moduleFullPath = npmModule.path === '' ? tempNodeModulesPath + npmModule.name : tempNodeModulesPath + npmModule.path;
                if (installedModules[npmModule.fullName]) {
                    npmModules[npmModule.fullName] = require(moduleFullPath);
                    itemsProcessed++;
                }
                else {
                    node.status({ fill: "blue", shape: "dot", text: "installing packages" });
                    npm.load({ prefix: tempDir, progress: false, loglevel: 'silent' }, function (er) {
                        if (er) {
                            errors.push({ moduleName: npmModule.fullName, error: er });
                            itemsProcessed++;
                            setStatus(errors, itemsProcessed);
                            return node.error(er);
                        }
                        npmInstallTo(tempDir, [npmModule.fullName]).then(() => {
                            try {
                                npmModules[npmModule.fullName] = require(moduleFullPath);
                                node.log('Downloaded and installed NPM module: ' + npmModule.fullName);
                                installedModules[npmModule.fullName] = true;
                            } catch (err) {
                                installedModules[npmModule.fullName] = false;
                                errors.push({ moduleName: npmModule.fullName, error: err });
                                node.error(err);
                            }
                        }).catch(er => {
                            installedModules[npmModule.fullName] = false;
                            errors.push({ moduleName: npmModule.fullName, error: er });
                            setStatus(errors, itemsProcessed);
                            return node.error(er);
                        }).then(() => {
                            itemsProcessed++;
                            setStatus(errors, itemsProcessed);
                        })
                    })
                }
            }, this);

            var checkPackageLoad = function () {
                var downloadProgressResult = null;
                if (requiredModules.length != 0) {
                    requiredModules.forEach(function (npmModule) {
                        if (!(installedModules.hasOwnProperty(npmModule.fullName))) {
                            downloadProgressResult = false;
                        } else {
                            downloadProgressResult = (downloadProgressResult !== null) ? (downloadProgressResult && true) : true
                        }
                    }, this);
                } else {
                    downloadProgressResult = true;
                }
                return downloadProgressResult;
            };

            var requireOverload = function (moduleName) {
                try {
                    return npmModules[moduleName];
                } catch (err) {
                    node.error("Cannot find module : " + moduleName);
                }
            };

            sandbox.__npmModules__ = npmModules;
            sandbox.require = requireOverload;

            var context = vm.createContext(sandbox);
            node.script = vm.createScript(functionText, createVMOpt(node, ""));
            var promise = Promise.resolve();

            function processMessageReal(msg, send, done) {
                var start = process.hrtime();
                context.msg = msg;
                context.__send__ = send;
                context.__done__ = done;

                node.script.runInContext(context);
                context.results.then(function (results) {
                    sendResults(node, send, msg._msgid, results, false);
                    if (handleNodeDoneCall) {
                        done();
                    }
                    var duration = process.hrtime(start);
                    var converted = Math.floor((duration[0] * 1e9 + duration[1]) / 10000) / 100;
                    node.metric("duration", msg, converted);
                    if (process.env.NODE_RED_FUNCTION_TIME) {
                        node.status({ fill: "yellow", shape: "dot", text: "" + converted });
                    }
                }).catch(err => {
                    if ((typeof err === "object") && err.hasOwnProperty("stack")) {
                        var index = err.stack.search(/\n\s*at ContextifyScript.Script.runInContext/);
                        err.stack = err.stack.slice(0, index).split('\n').slice(0, -1).join('\n');
                        var stack = err.stack.split(/\r?\n/);
                        msg.error = err;
                        var line = 0;
                        var errorMessage;
                        if (stack.length > 0) {
                            while (line < stack.length && stack[line].indexOf("ReferenceError") !== 0) {
                                line++;
                            }
                            if (line < stack.length) {
                                errorMessage = stack[line];
                                var m = /:(\d+):(\d+)$/.exec(stack[line + 1]);
                                if (m) {
                                    var lineno = Number(m[1]) - 1;
                                    var cha = m[2];
                                    errorMessage += " (line " + lineno + ", col " + cha + ")";
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

            function processMessage(msg, send, done) {
                if (checkPackageLoad())
                    processMessageReal(msg, send, done);
                else {
                    var intervalId = setInterval(function () {
                        if (checkPackageLoad()) {
                            clearInterval(intervalId);
                            processMessageReal(msg, send, done);
                        }
                        else
                            node.status("waiting for packages");
                    }, 500);
                }
            }

            const RESOLVING = 0;
            const RESOLVED = 1;
            const ERROR = 2;
            var state = RESOLVING;
            var messages = [];

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

            // //change???
            // node.on("input", function (msg, send, done) {
            //     if (state === RESOLVING) {
            //         messages.push({ msg: msg, send: send, done: done });
            //     }
            //     else if (state === RESOLVED) {
            //         processMessage(msg, send, done);
            //     }
            // });
        }
        catch (e) {
            node.error(e);
            console.trace(e);
            updateErrorInfo(err);
        }

        node.on("close", function () {
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
}
