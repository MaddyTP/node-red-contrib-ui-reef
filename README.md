# node-red-contrib-ui-reef

[![platform](https://img.shields.io/badge/platform-Node--RED-red)](https://nodered.org)

**ANNOUNCEMENT** - As of 30th November 2024 this project should be considered deprecated. I will leave it here until [node-red-dashboard](https://github.com/node-red/node-red-dashboard) is officially archived so it can still be installed. 
This project has evolved to [@maddytp/node-red-dashboard-2-ui-reef](https://github.com/MaddyTP/node-red-dashboard-2-ui-reef) which runs on [Flowfuse Dashboard](https://github.com/FlowFuse/node-red-dashboard).

These nodes were designed to facilitate the creation of a Node-RED aquarium or hydroponics controller.  [node-red-dashboard](https://github.com/node-red/node-red-dashboard) (min v2.10.0) is required and must be installed first.

![image](https://user-images.githubusercontent.com/45469378/146694931-4b29cefe-bff7-48d8-b2ff-3cca6dedfff5.png)

## Install

Either use the Manage Palette option in the Node-RED Editor menu, or run the following command in your Node-RED user directory - typically `~/.node-red`

```javascript
npm install node-red-contrib-ui-reef
```

## Probe

![image](https://user-images.githubusercontent.com/45469378/146694968-1ff84c32-0ac8-4483-bc17-e7087a5569cc.png)

Probe accepts two types of data, live data or stored data.  Live data can be fed via `msg.payload` or stored data via an array of objects with an `x` and `y` property:

Live data:
```javascript
msg = { payload: 8.15 }
```

Stored data:
```javascript
[
    { x: 1520527095000, y: 8.15 },
    { x: 1520934095000, y: 8.17 }
]
```

When providing data for the time scale, this node uses timestamps defined as milliseconds since the epoch (midnight January 1, 1970, UTC) internally. However, it will also accept most datetime formats by way of the included [chartjs-adapter-moment](https://github.com/chartjs/chartjs-adapter-moment) plugin.  

Value on the right will show most recent datapoint whether that be live data or stored data.  If a symbol is specified it will be appended to this value only.  Regardless of input data, the time component will be validated against the configured timeframe and older values dropped.  Additionally, there are options to round values to a decimal place and/or map value(s) to a range.

## Output

![image](https://user-images.githubusercontent.com/45469378/146694977-60294bd5-ef14-4466-bfb1-3784107c5538.png)

Output node is a highly modified fork of [node-red-contrib-ui-multistate-switch](https://github.com/bartbutenaers/node-red-contrib-ui-multistate-switch) and the Node-Red Function node.  In essence, it provides a switch option to run a function on interval instead of on incoming `msg`.  Function runs initially when the switch is set to the function option then repeats on the specified interval.  Changing switch position to any other option will cancel the interval and send static value associated with selected option.  

If `toFront` property is set in function the value will be sent to the front to be displayed in the upper-right hand of widget.  Switch states will be restored on restart or reboot if Node-RED settings specify "localfilesystem" as store. Color option allows specific colors to be set for different switch positions.

## Input

![image](https://user-images.githubusercontent.com/45469378/146695082-7d691a09-d58b-4a04-9737-af2f5fafc4c8.png)

Input node is a modification of [node-red-contrib-ui-multistate-switch](https://github.com/bartbutenaers/node-red-contrib-ui-multistate-switch) which sets switch based on input value.  Color option allows specific colors to be set for different switch positions. 

## Important Note

These nodes would not be possible without the following projects:

* [barbutenaers](https://github.com/barbutenaers) and [hotnipi](https://github.com/hotNipi) - [node-red-contrib-ui-multistate-switch](https://github.com/bartbutenaers/node-red-contrib-ui-multistate-switch)
* Node-Red - [Node-RED](https://github.com/node-red/node-red)
* Node-Red Dashboard - [node-red-dashboard](https://github.com/node-red/node-red-dashboard)
* ChartJS - [ChartJS](https://github.com/chartjs/Chart.js) and [chartjs-plugin-moment](https://github.com/chartjs/chartjs-adapter-moment)