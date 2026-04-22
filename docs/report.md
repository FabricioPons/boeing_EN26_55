# 3. Software

## 3.1 Define

The Boeing 777F cargo hold carries pallets and containers (collectively called ULDs, Unit Load Devices) that are held in place by mechanical locks embedded in the floor. Each ULD position has up to four locks. Before takeoff, every lock in every loaded position must be fully engaged. If even one lock fails to engage, the ULD can shift during flight and create a serious safety hazard.

Today there is no way for the crew to see, at a glance, whether every lock in the hold is engaged. They rely on a physical walk around and a visual check. The goal of this project is a software system that takes real time sensor data from each lock and shows the state of the entire hold on a dashboard.

More specifically, the software had to meet the following requirements:

1. Read lock state from sensors connected to Arduinos installed near the cargo floor.
2. Show the state of every ULD and every lock in a clear, aviation style interface.
3. Warn the operator the moment any lock disengages.
4. Let a loadmaster walking the hold see the same data on a phone or tablet.
5. Keep a time stamped log of every state change so the flight can be reviewed later.
6. Be fully demonstrable without hardware, for training and presentation.
7. Run on any modern browser, with no software to install on the operator's laptop.

### Human Machine Interface requirements

The Human Machine Interface, or HMI, is the part of the system a person actually looks at and interacts with. In an aviation context it is not enough for the HMI to simply work. It has to meet a stricter set of expectations around safety, efficiency, and compliance with Boeing operational standards, because the people using it are making decisions that affect an aircraft and its cargo.

Safety comes first. The HMI has to make the state of every lock visible at a glance and unambiguous. A person should never have to guess, calculate, or click through several screens to find out whether a given ULD is fully secured. Color coding, status summaries, and alerts must be consistent so that a wrong reading cannot be confused with a correct one.

Efficiency matters because cargo operations run on a tight schedule. The HMI has to give each user the information they need immediately and without noise. A ground loader in the cargo hold should not be forced to wade through data meant for an operations manager, and an operations manager should not have to drill down into raw sensor readings to see whether the aircraft is ready to depart.

Compliance with Boeing standards means the visual language, the terminology (ULD positions, lock indices, engaged and disengaged states), and the behavior of alerts all follow the conventions used in Boeing aircraft and supporting systems. Crews and ground staff who are already trained on Boeing interfaces should feel at home with this one from the first time they see it.

### Role based functionality

To satisfy these requirements without overloading anyone with irrelevant information, the HMI is organized around the three roles that actually use the system. Each role sees a view tailored to what they need to do, and has permissions scoped to match that responsibility.

**Ops (Remote Airline Operator).** The Ops user sits at an airline operations desk, away from the aircraft, and is responsible for watching cargo readiness across every flight the airline is tracking. This role needs aircraft wide status at a glance, live alerts when something goes wrong on any aircraft, and access to the historical record so incidents can be reviewed later. The Ops permissions allow viewing all flights in the system, acknowledging alerts from the desk, and exporting logs for internal review or regulatory reporting.

**Ground Loader Operator.** The Ground Loader Operator works on the ramp while cargo is being placed into the aircraft, and uses the system in the short window right before departure. Their interaction has to be simple and fast, because they are often holding a phone or tablet in one hand while working with the other. This role needs immediate feedback on whether every lock in the current flight is engaged, so any problem can be corrected before the aircraft leaves. The Ground Loader permissions are scoped to the current flight only, cover viewing status and anomalies as they appear, and allow the user to confirm the start and end of the "loading mode" period, which is the time window during which ULDs are being placed and locks are being engaged.

**Maintenance Engineer.** The Maintenance Engineer works between flights and focuses on mechanical issues with the locking hardware. This role needs detailed fault cases, the full timeline of events on the aircraft, and the ability to identify repeat offenders, which are specific locks or ULD positions that produce problems across multiple flights. The Maintenance permissions include viewing the entire historical record, filtering events by a specific lock or ULD position, and optionally attaching notes to events so that information gathered during one inspection is available for the next one.

Splitting the interface along these three roles keeps each view simple for the person using it while still letting the underlying system be a single application with a single source of truth.

## 3.2 Select

Several technology choices drove the rest of the project. We picked each one for a specific reason, and we have grouped them below by where they sit in the system: the sensor end, the dashboard end, the communication between them, and the server that ties it all together.

### The sensor end

**Arduino Uno WiFi Rev4.** The microcontroller that reads the physical lock sensor and talks to the laptop. A microcontroller is a small computer on a single chip, designed to run one simple program reliably rather than general purpose software. We chose this particular model because it is inexpensive, widely available from multiple suppliers, well supported by a mature and free development environment, and powerful enough to handle the small amount of work required (reading a pin, formatting a short message, sending it over USB) without any strain. The WiFi variant was selected to leave room for future wireless sensor nodes, although the current system uses only the USB connection.

### The dashboard end

**A browser based web application.** We chose a web app over a traditional desktop program because it runs on any device with a modern browser. The same code works on a laptop inside the cargo hold, on a tablet on the flight deck, and on a phone in the loadmaster's pocket. Nothing has to be installed. Loadmasters just scan a QR code and the dashboard is in front of them.

**React.** React is a tool for building interactive user interfaces. Its main advantage for a dashboard like this one is that the screen updates itself whenever the underlying data changes. We never have to write code that says "the third lock in row two turned green, please refresh that cell." We just update the data, and React figures out what needs to redraw. This makes the code short and reliable.

**Create React App.** The official toolkit that takes care of the complicated parts of building a modern React web app. It bundles dozens of small source files into a single efficient download, runs a local development server that reloads the app the moment any file is saved, and produces an optimized build for deployment. Using Create React App meant we did not have to configure any of this by hand and could spend our time on the parts of the project that actually mattered.

**Tailwind CSS.** A styling system built around a large set of small, composable classes. Instead of writing a new stylesheet for every component, we assemble a visual style directly on each element from ready made pieces like "dark background," "medium padding," and "cyan text." This let us match the aviation cockpit aesthetic consistently across many screens without maintaining a growing pile of custom style files. A short custom stylesheet was added on top for the distinctive "panel with a cyan header" look that repeats throughout the dashboard.

**lucide-react.** A library of clean, consistent line drawn icons designed to match modern interfaces. We used it for the mode switcher, the status indicators, the buttons, and the small markers that appear next to text throughout the dashboard. Having a single icon set kept the interface visually coherent with no effort.

**qrcode.react.** A small library that renders a QR code as a crisp vector image directly inside the dashboard. When the operator wants a supervisor's phone to join as a viewer, the dashboard shows a QR code with the viewer web address encoded in it. The supervisor points their phone camera at the screen and the dashboard opens, with no typing and no links to share over messaging apps.

**The Web Audio API.** A browser standard that lets a web page generate sound on the fly. When a lock disengages, the dashboard produces a short attention getting tone through whatever device the operator is using. Because the tone is generated in code rather than loaded from an audio file, it works consistently across every device and adds nothing to the download size of the app.

### The link between sensor and dashboard

**The Web Serial API.** This is a feature built into Chrome, Edge, and Opera that lets a web page read and write data directly through a USB serial port. Before the Web Serial API existed, talking to an Arduino from a browser required installing a helper program. Today we can plug the Arduino into the laptop, click Connect, and the browser talks to it directly. This removes a whole class of IT headaches in an aviation environment where installing software is often restricted.

**JSON messages over USB serial.** Every message from the Arduino is a single line of JSON, which is a common text format for structured data. The format is easy for a human to read during debugging, easy for JavaScript to parse, and easy to extend. When we later needed to add timing information to the messages, we just added two new fields and no old code had to change.

### The server and broadcast layer

**Node.js.** The runtime environment that the relay server runs on. Node.js lets JavaScript run outside of a browser, which is what makes it possible to use the same language across the entire system. The Arduino firmware is written in C, but everything above it, from the dashboard to the server, shares a single language. This kept the codebase smaller and the mental overhead lower.

**Express.** A very small web server framework for Node.js. It does two jobs in this project: it serves the web app files to anyone on the network, and it provides the foundation that Socket.io runs on top of.

**Socket.io.** A library that keeps a live, two way connection open between a server and any number of connected clients. When the main laptop receives an update from the Arduino, Socket.io pushes that update to every phone and tablet that is connected, all within a few milliseconds. The alternative would be each viewer device repeatedly asking the server "anything new yet?" several times a second, which wastes bandwidth and adds delay. Socket.io instead notifies clients the moment something changes.

**Cloudflare Tunnel for remote viewers.** Socket.io and Express work well when every device is on the same local network, but in real cargo operations a loadmaster or supervisor might be on cellular data, on a different WiFi network, or in another part of the airport entirely. To cover that case we added a tunnel service that makes the local server reachable from the public internet on a temporary web address. A tunnel is a secure outgoing connection from the laptop to a cloud provider that in turn accepts requests from the public and forwards them back down the tunnel to the laptop. Nothing has to be exposed to the internet from the network itself, no router ports have to be opened, and no new firewall rules are needed. Cloudflare provides this service for free under the name "quick tunnel" and the command line tool is called cloudflared. Running a single command on the laptop prints a web address that any phone, tablet, or laptop in the world can use to reach the dashboard, and the address goes away when the command is stopped.

## 3.3 Design

The system has three layers that work together.

**The Arduino layer (the edge).** Each Arduino sits next to a lock and reads the state of the lock sensor through one of its digital input pins. The Arduino checks that pin every 10 milliseconds. When the state changes, it builds a JSON message and sends it over USB. It also sends a heartbeat message every second, so the dashboard knows the connection is alive even if nothing has changed.

**The web application layer (the dashboard).** This is what the operator sees. It has three distinct modes the user can switch between:

- **USB mode** is the real monitoring screen. It opens the serial port, parses incoming messages, keeps track of every ULD and every lock, and draws the grid.
- **Demo mode** shows the same interface but with simulated data. It exists so the app can be shown and practiced with when no hardware is available.
- **Latency test mode** is a diagnostic tool that measures how fast the pipeline actually is. It is described in detail in section 3.5.

**The broadcast layer (for viewers).** The main laptop is the master. When it gets an update from the Arduino, it also publishes that update to a small server. Any phone or tablet that connects to the server in viewer mode receives the updates instantly. This means the loadmaster walking the cargo hold sees exactly the same thing as the operator at the laptop, without any manual refresh. A QR code shown in the main app gives viewers a one tap way to join.

The broadcast layer supports two ways for a viewer device to connect, so the system works in any situation a loadmaster might be in. The first is over the local network. The relay server automatically discovers the laptop's local IP address and builds the viewer URL from it, so anyone on the same WiFi can reach it. The second is over a public tunnel. When the operator starts cloudflared on the laptop, the public web address it generates points back to the same server through an encrypted tunnel, so a phone on cellular data, a tablet in a different building, or a supervisor on the other side of the airport can all see the live dashboard with no additional setup. The operator can switch between modes by updating the URL in the QR code, and the rest of the system works the same way regardless of which path the viewer takes.

The data flow for a single lock event goes like this: the sensor changes state, the Arduino sees the pin value flip, the Arduino builds a JSON message and stamps it with the current time, the message travels over USB, the browser receives it, the React data model updates, the grid cell changes color, and the same update is broadcast to every connected viewer. All of this happens in about 11 milliseconds, as we will see in section 3.6.

The interface follows an aviation industrial style. The color palette, the monospaced font, and the panel layout are chosen to feel familiar to flight crews and loadmasters who are used to cockpit displays. The grid layout reflects the real geometry of the cargo hold, with support for the three common loading patterns (side by side, center load, and lower deck).

## 3.4 Build

With the choices and design in place, the following pieces were actually built.

**Arduino firmware.** A compact program that initializes the serial port, configures the sensor pin, and enters a loop that reads the pin, detects state changes, and sends JSON over serial. Roughly 180 lines of code. Later in the project, we added two diagnostic commands (PING and BURST) to support the latency test work.

**The web application.** The main parts are:

- A configuration screen where the operator picks which cargo hold layout is being loaded.
- A monitoring screen with a color coded grid. Green means all four locks engaged, yellow means partial, red means fully disengaged, gray means no data yet.
- A detail view that opens when the operator clicks a ULD, showing each of its four locks individually.
- An alert panel that shows any unlocked position and plays a short audio tone when a lock disengages.
- A flight log that records every state change with a timestamp, and an export button that downloads the log as a CSV file.
- A QR code panel with the viewer URL, so phones and tablets can join in one tap.
- The latency test screen with live statistics and a burst test button.

**The relay server.** A small Express program of a few dozen lines that serves the built web app to anyone on the network and runs the Socket.io hub. It forwards state updates from the master laptop to every connected viewer, and sends a snapshot of the current state to any new viewer that joins so they do not have to wait for the next event.

**The tunnel script.** A single entry in the project's package.json runs cloudflared and opens a public tunnel to the relay server. The operator does not have to configure anything. Starting the tunnel prints a temporary web address that any device with internet access can use to view the dashboard, and stopping the command closes the tunnel. We kept this as a separate opt in step instead of running it automatically, because on a secure cargo operation the operator should consciously choose when to expose the dashboard outside the local network.

**The styling system.** A custom "avion panel" style was defined to give every card the aviation cockpit look. It uses a dark background, a blue bar across the top, and cyan uppercase headers. Tailwind CSS was used for layout and spacing so we could iterate quickly without writing new stylesheets for every screen.

## 3.5 Test

Two kinds of testing were performed. The first was functional, which just asks: does the system do what it is supposed to do? The second was performance, which asks: how fast is it?

**Functional testing.** We connected an Arduino to the laptop, triggered sensor events on the input pin, and confirmed the corresponding grid cell changed color and the audio alert played. We disconnected the Arduino mid session and confirmed the dashboard reflected the disconnection and preserved the log. We launched a second device in viewer mode and confirmed its grid mirrored the master in real time. We exported the flight log and opened the CSV in a spreadsheet program to confirm it was correctly formed. We ran full loading scenarios in demo mode to make sure the interface handled all three cargo hold layouts without issues. We also tested the public tunnel path by starting cloudflared on the laptop, opening the generated public address on a phone connected to cellular data (not the laptop's WiFi), and confirming that state updates still arrived in real time from the other side of the internet.

**Performance testing.** This was the more interesting part of testing, and it is worth explaining at some length because it led to a meaningful correction.

The goal was to measure the delay between the Arduino seeing a sensor event and the dashboard showing the new state. In software this delay is called **latency**. A latency of 100 milliseconds is roughly the point at which a human starts to feel a lag. Anything below that feels instant.

The challenge is that the Arduino and the laptop each have their own internal clock, and those clocks do not agree. The Arduino's clock starts when it is powered on. The laptop's clock counts from when the browser page loaded. You cannot just subtract one from the other. You first have to figure out the offset between them.

The method we used is a simplified version of what internet time servers use. The laptop sends a short PING message to the Arduino. The Arduino replies immediately with its current clock reading. The laptop records when the reply came back. From the round trip time and the Arduino's clock reading, the laptop can estimate what the Arduino's clock said at the exact moment of the reply. Once that offset is known, every future sensor message can be translated into the laptop's timeline, and latency becomes a simple subtraction.

To get a lot of measurements quickly, we added a BURST command to the Arduino. When the dashboard sends this command, the Arduino fires a configurable number of fake state changes at a fixed spacing (typically 50 or 80 events at 100 milliseconds apart). Each one is stamped with its own time, so each one produces a latency measurement. In about five seconds we collect enough data to compute reliable statistics.

In addition to the average, we also report **percentiles**. A percentile is an honest way to describe how a system usually behaves. The 95th percentile, written as P95, is the value that 95 out of 100 samples come in under. If the P95 latency is 12 milliseconds, then 95 percent of events arrive within 12 milliseconds, and only the slowest 5 percent take longer. Percentiles are harder to fool than averages, because a single bad sample can distort an average but barely moves a percentile.

The first round of measurements produced something strange. The average latency was around 54 milliseconds, which by itself is fine, but the live chart of samples showed a clear saw tooth pattern. The measured latency would climb steadily for about two seconds, drop back to its starting value, and climb again. Back to back burst tests also gave very different averages (42 milliseconds in one run, 92 milliseconds in the next) even though nothing about the hardware or the software had changed.

That pattern pointed to clock drift. Two clocks never tick at exactly the same rate. Even the precision crystals used in Arduinos and laptops have small manufacturing differences, so one counts a little faster than the other. In our case the Arduino's clock ran about 0.23 percent slower than the laptop's. That does not sound like much, but over the two second gap between our clock sync pings, it added up to about five milliseconds of accumulated measurement error. The saw tooth was the error piling up, and the sudden drop was the next ping resetting it.

The fix was to switch from a single, static estimate of the offset to a continuously updated model that tracks both the offset and the tiny rate difference between the two clocks. In math terms, instead of treating the Arduino clock as `arduino = laptop + offset`, we treat it as `arduino = skew * laptop + offset` and estimate both numbers from the history of ping measurements. After the change, the saw tooth vanished from the chart and the numbers stabilized.

## 3.6 Results

The final performance numbers are the following:

| Metric | Value |
| --- | --- |
| Median latency (P50) | 10.5 milliseconds |
| Average latency | 10.6 milliseconds |
| 95th percentile (P95) | 11.7 milliseconds |
| Worst observed | 15.8 milliseconds |
| Best observed | 8.9 milliseconds |

Two ways to put those numbers in context:

- 100 milliseconds is roughly where a human starts to perceive a delay. Our P95 is about one ninth of that.
- Human visual reaction time is about 250 milliseconds. Our system is roughly 23 times faster than a person could react to what they see on the screen.

In plain language, the dashboard reflects a lock change before anyone watching could possibly notice that any time had passed.

The burst test and the rolling statistics agreed within one tenth of a millisecond on every metric, which gives us confidence that the measurement itself is stable and repeatable. The skew the software measured between the Arduino and the laptop clocks was 0.997701, meaning the Arduino ticks about 0.23 percent slower, which is perfectly ordinary for crystal oscillators.

Functionally, every requirement in section 3.1 was met. Demo mode, USB mode, and the viewer broadcast all work as designed. The flight log exports correctly. Disconnection is handled cleanly. Multiple viewers can follow the same master at once.

## 3.7 Conclusions and Lessons Learned

**The system is ready to demonstrate.** The measured latency is far below the threshold at which anyone watching could perceive a delay. The functional features cover every requirement that was defined at the start of the project.

**How you measure something matters as much as what you measure.** The first round of performance testing reported roughly 54 milliseconds of latency. The corrected round reported about 11 milliseconds on the exact same hardware, with no change to the signal path. The difference was entirely in how the measurement compensated for the two independent clocks. It is easy to blame a system for being slow when the real problem is an instrument that is lying to you. When a measurement disagrees with intuition, the instrument is worth auditing before the system.

**The shape of data tells a story that numbers alone cannot.** The saw tooth pattern in the live chart was what pointed us at clock drift. If we had only looked at the average, we would have concluded the system was slow and gone looking in the wrong places. Plotting raw samples during testing is a small investment that often saves much larger investigations later.

**Clock drift is real, even on short time scales.** A rate difference of 0.23 percent between two crystals sounds negligible, but over two seconds it produces five milliseconds of error, which is the same order of magnitude as the real latency we were trying to measure. In any future work that spans multiple devices with independent clocks, the rate difference is worth tracking continuously rather than assumed to be zero.

**Automated tests paid for themselves immediately.** The burst test gave us enough data points in five seconds to diagnose the saw tooth problem. Doing the same measurements by hand, one lock event at a time, would have taken an hour and would not have produced a clean enough signal to see the pattern. Building the test tools was a small up front cost that unlocked faster engineering from then on.

**Report percentiles, not averages, for performance claims.** Averages can be dragged around by outliers. The P95 value is harder to distort and is the honest number to cite when telling a stakeholder how the system behaves. Saying "95 percent of events are faster than 12 milliseconds" is both more accurate and more useful than saying "the average is 11 milliseconds."

**Web standards removed several categories of problems.** Choosing the Web Serial API and Socket.io instead of a custom desktop program meant there was nothing to install on the laptop, and loadmasters could join the dashboard from their own phones without any setup. In an aviation environment, where workstations are typically locked down and installing new software requires approval, this saved significant friction.

**A tunnel is the right answer when local networking is not enough.** At first the dashboard only worked when every device was on the same WiFi. That covered the most common case but it failed for anyone farther away, like a supervisor on cellular data or a reviewer in a different part of the airport. Adding Cloudflare's quick tunnel as an optional one command step solved the problem without opening any firewall ports, without exposing anything on the network directly to the internet, and without requiring any paid infrastructure. The lesson is that a local network is a fragile assumption for a modern operations tool, and a tunnel provides a cheap, reversible way to remove that assumption.

**Demo mode was worth building as a first class feature.** Having a fully working simulated version of the system from early in the project meant the interface could be iterated on, shown to stakeholders, and tested without the hardware being present. What started as a testing convenience ended up being one of the most used parts of the application during development and presentation.
