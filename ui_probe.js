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

 const path = require('path');

 module.exports = (RED) => {
    function checkConfig(node, conf) {
        if (!conf || !conf.hasOwnProperty('group')) {
            node.error(RED._('table.error.no-group'));
            return false;
        }
        else {
            return true;
        }
    }
    
    function HTML(config) {
        config.id = config.id.replace('.', '_');
        const configAsJson = JSON.stringify(config);
        const html = String.raw`
        <link href='ui-reef/css/uireef.css' rel='stylesheet' type='text/css'>
        <script type='text/javascript' src='ui-reef/js/highcharts.js'></script>
        <div class="probe-container" ng-init='init(${configAsJson})'>
            <div id="uiProbeChart_${config.id}" class="probe-chart"></div>
            <div class="probe-label">
                <div class="probe-name">${config.label}</div>
                <div class="probe-value">{{inputValue}}</div>
            </div>
        </div>
       `;
        return html;
    }

    let ui;

    function ProbeNode(config) {
        const node = this;
        try {
            if (checkConfig(node, config)) {
                if (ui === undefined) {
                    ui = RED.require('node-red-dashboard')(RED);
                }

                config.dark = false;
                if (typeof ui.isDark === 'function') {
                    config.dark = ui.isDark();
                    config.widgetColor = ui.getTheme()['widget-backgroundColor'].value;
                }

                RED.nodes.createNode(this, config);

                const html = HTML(config);
                const done = ui.addWidget({
                    node,
                    group: config.group,
                    order: config.order,
                    width: config.width,
                    height: config.height,
                    format: html,
                    templateScope: 'local',
                    emitOnlyNewValues: false,
                    forwardInputMessages: false,
                    storeFrontEndInputAsState: true,
                    convertBack: (data) => {
                        if (data) {
                            if (data[0] && data[0].hasOwnProperty('values')) {
                                return [data[0].values];
                            }
                            if (data.length == 0) {
                                return [];
                            }
                        }
                    },
                    convert: (value, oldValue, msg) => {
                        let converted = {};
                        if (Array.isArray(value)) {
                            if (value.length === 0) { // reset chart
                                converted.update = false;
                                converted.updatedValues = [];
                                return converted;
                            }
                            if (value[0].hasOwnProperty("series") && value[0].hasOwnProperty("data")) {
                                var flag = true;
                                for (var dd = 0; dd < value[0].data.length; dd++ ) {
                                    if (!isNaN(value[0].data[dd][0])) { flag = false; }
                                }
                                if (flag) { delete value[0].labels; }

                                if (config.removeOlderPoints) {
                                    for (var dl=0; dl < value[0].data.length; dl++ ) {
                                        if (value[0].data[dl].length > config.removeOlderPoints) {
                                            value[0].data[dl] = value[0].data[dl].slice(-config.removeOlderPoints);
                                        }
                                    }
                                }
                                
                                value = [{ key:node.id, values:(value[0] || {series:[], data:[], labels:[]}) }];
                            } else {
                                node.warn("Bad data inject");
                                value = oldValue;
                            }
                            converted.update = false;
                            converted.updatedValues = value;
                        } else {
                            if (value === false) { value = null; }              // let false also create gaps in chart
                            if (value !== null) {                               // let null object through for gaps
                                value = parseFloat(value);                      // only handle numbers
                                if (isNaN(value)) { return; }                   // return if not a number
                            }
                            converted.newPoint = true;
                            var label = msg.label || "";
                            var series = msg.series || msg.topic || "";
                            if ((!oldValue) || (oldValue.length === 0)) {
                                oldValue = [{ key:node.id, values:{ series:[], data:[], labels:[] } }];
                            }
                            var refill = false;
                            var s = oldValue[0].values.series.indexOf(series);
                            if (!oldValue[0].values.hasOwnProperty("labels")) { oldValue[0].values.labels = []; }
                            var l = oldValue[0].values.labels.indexOf(label);
                            if (s === -1) {
                                oldValue[0].values.series.push(series);
                                s = oldValue[0].values.series.length - 1;
                                oldValue[0].values.data[s] = [];
                                if (l > 0) { refill = true; }
                            }
                            if (l === -1) {
                                oldValue[0].values.labels.push(label);
                                l = oldValue[0].values.labels.length - 1;
                                if (l > 0) { refill = true; }
                            }
                            var time;
                            if (msg.timestamp !== undefined) { 
                                time = new Date(msg.timestamp).getTime(); 
                            } else { 
                                time = new Date().getTime(); 
                            };
                            var limitOffsetSec = parseInt(config.removeOlder) * parseInt(config.removeOlderUnit);
                            var limitTime = time - limitOffsetSec * 1000;
                            if (time < limitTime) { return oldValue; } // ignore if too old for window
                            var point = { "x":time, "y":value };
                            oldValue[0].values.data[s].push(point);
                            converted.newPoint = [{ key:node.id, update:true, values:{ series:series, data:point, labels:label } }];
                            var rc = 0;
                            for (var u = 0; u < oldValue[0].values.data[s].length; u++) {
                                if (oldValue[0].values.data[s][u].x >= limitTime) { break; } // stop as soon as we are in time window.
                                else { rc += 1; }
                            }
                            if (rc > 0) { oldValue[0].values.data[s].splice(0,rc); }
                            if (config.removeOlderPoints) {
                                var rc2 = oldValue[0].values.data[s].length-config.removeOlderPoints;
                                if (rc2 > 0) { oldValue[0].values.data[s].splice(0,rc2); rc = rc2;}
                            }
                            if (rc > 0) { converted.newPoint[0].remove = rc; }
                            var swap; // insert correctly if a timestamp was earlier.
                            for (var t = oldValue[0].values.data[s].length-2; t>=0; t--) {
                                if (oldValue[0].values.data[s][t].x <= time) {
                                    break;  // stop if we are in the right place
                                }
                                else {
                                    swap = oldValue[0].values.data[s][t];
                                    oldValue[0].values.data[s][t] = oldValue[0].values.data[s][t+1];
                                    oldValue[0].values.data[s][t+1] = swap;
                                }
                            }
                            if (swap) { converted.newPoint = true; } // if inserted then update whole chart

                            if (Date.now() > (dnow + 60000)) {
                                dnow = Date.now();
                                for (var x = 0; x < oldValue[0].values.data.length; x++) {
                                    for (var y = 0; y < oldValue[0].values.data[x].length; y++) {
                                        if (oldValue[0].values.data[x][y].x >= limitTime) {
                                            break;  // stop as soon as we are in time window.
                                        }
                                        else {
                                            oldValue[0].values.data[x].splice(0,1);
                                            converted.newPoint = true;
                                            y = y - 1;
                                        }
                                    }
                                }
                            }
                            converted.update = true;
                            converted.updatedValues = oldValue;
                        }
                        return converted;
                    },
                    beforeEmit: (msg) => {
                        if (msg) {
                            const newMsg = {};
                            newMsg.socketid = msg.socketid;
                            newMsg.state = RED.util.getMessageProperty(msg, config.stateField || 'payload');
                            return { msg: newMsg };
                        }
                        return msg;
                    },
                    beforeSend: (msg, orig) => {
                        return msg;
                    },
                    initController: ($scope) => {
                        $scope.flag = true;
                        $scope.chartDiv;
                        $scope.init = (config) => {
                            $scope.config = config;
                            $scope.unique = $scope.$eval('$id');
                            $scope.inputValue = 231;
                            $scope.chartDiv = new Highcharts.chart('uiProbeChart_' + $scope.config.id, {
                                chart: {
                                    type: 'spline',
                                    backgroundColor: '#EAF4FA',
                                },
                                title: {
                                    text: ''
                                },
                                subtitle: {
                                    text: ''
                                },
                                xAxis: {
                                    visible: false,
                                },
                                yAxis: {
                                    visible: false,
                                    startOnTick: false,
                                    endOnTick: false,
                                    maxPadding: 0.01,
                                },
                                tooltip: {
                                    headerFormat: '',
                                    pointFormat: '{point.y:.2f}'
                                },
                                legend: {
                                    enabled: false,
                                },
                                credits: {
                                    enabled: false,
                                },
                                plotOptions: {
                                    series: {
                                        lineColor: '#0094CE',
                                    }
                                },
                                series: [{}],
                                exporting: {
                                    enabled: false,
                                }
                            });
                            $scope.chartDiv.reflow();
                        };

                        $scope.$watch('msg', (msg) => {
                            if (msg) {
                                $scope.chartDiv.series[0].setData(msg.state, true);
                                $scope.chartDiv.reflow();
                            }
                        });
                    },
                });

                node.on('close', () => {
                    done();
                });
            }
        } catch (e) {
            node.error(e);
        }
    }
    RED.nodes.registerType('ui_probe', ProbeNode);

    const uipath = RED.settings.ui.path || 'ui';
    const fullPath = path.join(RED.settings.httpNodeRoot, uipath, '/ui-reef/*').replace(/\\/g, '/');

    RED.httpNode.get(fullPath, function (req, res) {
        var options = {
            root: __dirname + '/lib/',
            dotfiles: 'deny'
        };
        res.sendFile(req.params[0], options)
    });
};
