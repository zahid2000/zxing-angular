import { CommonModule } from '@angular/common';
import { EventEmitter, Component, ChangeDetectionStrategy, ViewChild, Input, Output, NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { __awaiter } from 'tslib';
import { BrowserMultiFormatReader, BrowserCodeReader } from '@zxing/browser';
import { NotFoundException, ChecksumException, FormatException, BarcodeFormat, DecodeHintType } from '@zxing/library';
import { BehaviorSubject } from 'rxjs';

/**
 * Based on zxing-typescript BrowserCodeReader
 */
class BrowserMultiFormatContinuousReader extends BrowserMultiFormatReader {
    /**
     * Returns the code reader scanner controls.
     */
    getScannerControls() {
        if (!this.scannerControls) {
            throw new Error('No scanning is running at the time.');
        }
        return this.scannerControls;
    }
    /**
     * Starts the decoding from the current or a new video element.
     *
     * @param deviceId The device's to be used Id
     * @param previewEl A new video element
     */
    scanFromDeviceObservable(deviceId, previewEl) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const scan$ = new BehaviorSubject({});
            let ctrls;
            try {
                ctrls = yield this.decodeFromVideoDevice(deviceId, previewEl, (result, error) => {
                    if (!error) {
                        scan$.next({ result });
                        return;
                    }
                    const errorName = error.name;
                    // stream cannot stop on fails.
                    if (
                    // scan Failure - found nothing, no error
                    errorName === NotFoundException.name ||
                        // scan Error - found the QR but got error on decoding
                        errorName === ChecksumException.name ||
                        errorName === FormatException.name ||
                        error.message.includes('No MultiFormat Readers were able to detect the code.')) {
                        scan$.next({ error });
                        return;
                    }
                    // probably fatal error
                    scan$.error(error);
                    this.scannerControls.stop();
                    this.scannerControls = undefined;
                    return;
                });
                this.scannerControls = Object.assign(Object.assign({}, ctrls), { stop() {
                        ctrls.stop();
                        scan$.complete();
                    } });
            }
            catch (e) {
                scan$.error(e);
                (_a = this.scannerControls) === null || _a === void 0 ? void 0 : _a.stop();
                this.scannerControls = undefined;
            }
            return scan$.asObservable();
        });
    }
}

class ZXingScannerComponent {
    /**
     * Constructor to build the object and do some DI.
     */
    constructor() {
        /**
         * Delay between attempts to decode (default is 500ms)
         */
        this.timeBetweenScans = 500;
        /**
         * Delay between successful decode (default is 500ms)
         */
        this.delayBetweenScanSuccess = 500;
        /**
         * How the preview element shoud be fit inside the :host container.
         */
        this.previewFitMode = 'cover';
        this._ready = false;
        // instance based emitters
        this.autostarted = new EventEmitter();
        this.autostarting = new EventEmitter();
        this.torchCompatible = new EventEmitter(false);
        this.scanSuccess = new EventEmitter();
        this.scanFailure = new EventEmitter();
        this.scanError = new EventEmitter();
        this.scanComplete = new EventEmitter();
        this.camerasFound = new EventEmitter();
        this.camerasNotFound = new EventEmitter();
        this.permissionResponse = new EventEmitter(true);
        this.hasDevices = new EventEmitter();
        this.deviceChange = new EventEmitter();
        this._enabled = true;
        this._hints = new Map();
        this.autofocusEnabled = true;
        this.autostart = true;
        this.formats = [BarcodeFormat.QR_CODE];
        // computed data
        this.hasNavigator = typeof navigator !== 'undefined';
        this.isMediaDevicesSupported = this.hasNavigator && !!navigator.mediaDevices;
    }
    /**
     * Exposes the current code reader, so the user can use it's APIs.
     */
    get codeReader() {
        return this._codeReader;
    }
    /**
     * User device input
     */
    set device(device) {
        if (!this._ready) {
            this._devicePreStart = device;
            // let's ignore silently, users don't liek logs
            return;
        }
        if (this.isAutostarting) {
            // do not allow setting devices during auto-start, since it will set one and emit it.
            console.warn('Avoid setting a device during auto-start.');
            return;
        }
        if (this.isCurrentDevice(device)) {
            console.warn('Setting the same device is not allowed.');
            return;
        }
        if (!this.hasPermission) {
            console.warn('Permissions not set yet, waiting for them to be set to apply device change.');
            // this.permissionResponse
            //   .pipe(
            //     take(1),
            //     tap(() => console.log(`Permissions set, applying device change${device ? ` (${device.deviceId})` : ''}.`))
            //   )
            //   .subscribe(() => this.device = device);
            return;
        }
        this.setDevice(device);
    }
    /**
     * User device acessor.
     */
    get device() {
        return this._device;
    }
    /**
     * Returns all the registered formats.
     */
    get formats() {
        return this.hints.get(DecodeHintType.POSSIBLE_FORMATS);
    }
    /**
     * Registers formats the scanner should support.
     *
     * @param input BarcodeFormat or case-insensitive string array.
     */
    set formats(input) {
        if (typeof input === 'string') {
            throw new Error('Invalid formats, make sure the [formats] input is a binding.');
        }
        // formats may be set from html template as BarcodeFormat or string array
        const formats = input.map(f => this.getBarcodeFormatOrFail(f));
        const hints = this.hints;
        // updates the hints
        hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
        // handles updating the codeReader
        this.hints = hints;
    }
    /**
     * Returns all the registered hints.
     */
    get hints() {
        return this._hints;
    }
    /**
     * Does what it takes to set the hints.
     */
    set hints(hints) {
        var _a;
        this._hints = hints;
        // new instance with new hints.
        (_a = this.codeReader) === null || _a === void 0 ? void 0 : _a.setHints(this._hints);
    }
    /**
     * Sets the desired constraints in all video tracks.
     * @experimental
     */
    set videoConstraints(constraints) {
        var _a;
        // new instance with new hints.
        const controls = (_a = this.codeReader) === null || _a === void 0 ? void 0 : _a.getScannerControls();
        if (!controls) {
            // fails silently
            return;
        }
        controls === null || controls === void 0 ? void 0 : controls.streamVideoConstraintsApply(constraints);
    }
    /**
     *
     */
    set isAutostarting(state) {
        this._isAutostarting = state;
        this.autostarting.next(state);
    }
    /**
     *
     */
    get isAutostarting() {
        return this._isAutostarting;
    }
    /**
     * Can turn on/off the device flashlight.
     *
     * @experimental Torch/Flash APIs are not stable in all browsers, it may be buggy!
     */
    set torch(onOff) {
        try {
            const controls = this.getCodeReader().getScannerControls();
            controls.switchTorch(onOff);
        }
        catch (error) {
            // ignore error
        }
    }
    /**
     * Starts and Stops the scanning.
     */
    set enable(enabled) {
        this._enabled = Boolean(enabled);
        if (!this._enabled) {
            this.reset();
        }
        else {
            if (this.device) {
                this.scanFromDevice(this.device.deviceId);
            }
            else {
                this.init();
            }
        }
    }
    /**
     * Tells if the scanner is enabled or not.
     */
    get enabled() {
        return this._enabled;
    }
    /**
     * If is `tryHarder` enabled.
     */
    get tryHarder() {
        return this.hints.get(DecodeHintType.TRY_HARDER);
    }
    /**
     * Enable/disable tryHarder hint.
     */
    set tryHarder(enable) {
        const hints = this.hints;
        if (enable) {
            hints.set(DecodeHintType.TRY_HARDER, true);
        }
        else {
            hints.delete(DecodeHintType.TRY_HARDER);
        }
        this.hints = hints;
    }
    /**
     * Gets and registers all cammeras.
     */
    askForPermission() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.hasNavigator) {
                console.error('@zxing/ngx-scanner', 'Can\'t ask permission, navigator is not present.');
                this.setPermission(null);
                return this.hasPermission;
            }
            if (!this.isMediaDevicesSupported) {
                console.error('@zxing/ngx-scanner', 'Can\'t get user media, this is not supported.');
                this.setPermission(null);
                return this.hasPermission;
            }
            let stream;
            let permission;
            try {
                // Will try to ask for permission
                stream = yield this.getAnyVideoDevice();
                permission = !!stream;
            }
            catch (err) {
                return this.handlePermissionException(err);
            }
            finally {
                this.terminateStream(stream);
            }
            this.setPermission(permission);
            // Returns the permission
            return permission;
        });
    }
    /**
     *
     */
    getAnyVideoDevice() {
        return navigator.mediaDevices.getUserMedia({ video: true });
    }
    /**
     * Terminates a stream and it's tracks.
     */
    terminateStream(stream) {
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
        }
        stream = undefined;
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.autostart) {
                console.warn('Feature \'autostart\' disabled. Permissions and devices recovery has to be run manually.');
                // does the necessary configuration without autostarting
                this.initAutostartOff();
                this._ready = true;
                return;
            }
            // configurates the component and starts the scanner
            yield this.initAutostartOn();
            this._ready = true;
        });
    }
    /**
     * Initializes the component without starting the scanner.
     */
    initAutostartOff() {
        // do not ask for permission when autostart is off
        this.isAutostarting = false;
        // just update devices information
        this.updateVideoInputDevices();
        if (this._device && this._devicePreStart) {
            this.setDevice(this._devicePreStart);
        }
    }
    /**
     * Initializes the component and starts the scanner.
     * Permissions are asked to accomplish that.
     */
    initAutostartOn() {
        return __awaiter(this, void 0, void 0, function* () {
            this.isAutostarting = true;
            let hasPermission;
            try {
                // Asks for permission before enumerating devices so it can get all the device's info
                hasPermission = yield this.askForPermission();
            }
            catch (e) {
                console.error('Exception occurred while asking for permission:', e);
                return;
            }
            // from this point, things gonna need permissions
            if (hasPermission) {
                const devices = yield this.updateVideoInputDevices();
                yield this.autostartScanner([...devices]);
            }
            this.isAutostarting = false;
            this.autostarted.next();
        });
    }
    /**
     * Checks if the given device is the current defined one.
     */
    isCurrentDevice(device) {
        var _a;
        return (device === null || device === void 0 ? void 0 : device.deviceId) === ((_a = this._device) === null || _a === void 0 ? void 0 : _a.deviceId);
    }
    /**
     * Executes some actions before destroy the component.
     */
    ngOnDestroy() {
        return __awaiter(this, void 0, void 0, function* () {
            let stream = yield this.getAnyVideoDevice();
            this.terminateStream(stream);
            return new Promise((resolve) => {
                const videoEl = this.previewElemRef.nativeElement;
                if (videoEl) {
                    const stream = videoEl.srcObject;
                    if (stream) {
                        const tracks = stream.getTracks();
                        tracks.forEach(function (track) {
                            track.stop();
                        });
                        videoEl.srcObject = null;
                    }
                    else {
                        console.log('No stream available', { videoEl });
                    }
                }
                else {
                    console.log('No video stream', { videoEl });
                }
                this.reset();
                resolve(null);
            });
        });
    }
    /**
     *
     */
    ngOnInit() {
        this.init();
    }
    /**
     * Stops the scanning, if any.
     */
    scanStop() {
        var _a, _b;
        if (this._scanSubscription) {
            (_a = this.codeReader) === null || _a === void 0 ? void 0 : _a.getScannerControls().stop();
            (_b = this._scanSubscription) === null || _b === void 0 ? void 0 : _b.unsubscribe();
            this._scanSubscription = undefined;
        }
        this.torchCompatible.next(false);
    }
    /**
     * Stops the scanning, if any.
     */
    scanStart() {
        if (this._scanSubscription) {
            throw new Error('There is already a scan proccess running.');
        }
        if (!this._device) {
            throw new Error('No device defined, cannot start scan, please define a device.');
        }
        this.scanFromDevice(this._device.deviceId);
    }
    /**
     * Stops old `codeReader` and starts scanning in a new one.
     */
    restart() {
        // @note apenas necessario por enquanto causa da Torch
        this._codeReader = undefined;
        const prevDevice = this._reset();
        if (!prevDevice) {
            return;
        }
        this.device = prevDevice;
    }
    /**
     * Discovers and updates known video input devices.
     */
    updateVideoInputDevices() {
        return __awaiter(this, void 0, void 0, function* () {
            // permissions aren't needed to get devices, but to access them and their info
            const devices = (yield BrowserCodeReader.listVideoInputDevices()) || [];
            const hasDevices = devices && devices.length > 0;
            // stores discovered devices and updates information
            this.hasDevices.next(hasDevices);
            this.camerasFound.next([...devices]);
            if (!hasDevices) {
                this.camerasNotFound.next();
            }
            return devices;
        });
    }
    /**
     * Starts the scanner with the back camera otherwise take the last
     * available device.
     */
    autostartScanner(devices) {
        return __awaiter(this, void 0, void 0, function* () {
            const matcher = ({ label }) => /back|trás|rear|traseira|environment|ambiente/gi.test(label);
            // select the rear camera by default, otherwise take the last camera.
            const device = devices.find(matcher) || devices.pop();
            if (!device) {
                throw new Error('Impossible to autostart, no input devices available.');
            }
            yield this.setDevice(device);
            this.deviceChange.next(device);
        });
    }
    /**
     * Dispatches the scan success event.
     *
     * @param result the scan result.
     */
    dispatchScanSuccess(result) {
        this.scanSuccess.next(result.getText());
    }
    /**
     * Dispatches the scan failure event.
     */
    dispatchScanFailure(reason) {
        this.scanFailure.next(reason);
    }
    /**
     * Dispatches the scan error event.
     *
     * @param error the error thing.
     */
    dispatchScanError(error) {
        if (!this.scanError.observers.some(x => Boolean(x))) {
            console.error(`zxing scanner component: ${error.name}`, error);
            console.warn('Use the `(scanError)` property to handle errors like this!');
        }
        this.scanError.next(error);
    }
    /**
     * Dispatches the scan event.
     *
     * @param result the scan result.
     */
    dispatchScanComplete(result) {
        this.scanComplete.next(result);
    }
    /**
     * Returns the filtered permission.
     */
    handlePermissionException(err) {
        // failed to grant permission to video input
        console.error('@zxing/ngx-scanner', 'Error when asking for permission.', err);
        let permission;
        switch (err.name) {
            // usually caused by not secure origins
            case 'NotSupportedError':
                console.warn('@zxing/ngx-scanner', err.message);
                // could not claim
                permission = null;
                // can't check devices
                this.hasDevices.next(null);
                break;
            // user denied permission
            case 'NotAllowedError':
                console.warn('@zxing/ngx-scanner', err.message);
                // claimed and denied permission
                permission = false;
                // this means that input devices exists
                this.hasDevices.next(true);
                break;
            // the device has no attached input devices
            case 'NotFoundError':
                console.warn('@zxing/ngx-scanner', err.message);
                // no permissions claimed
                permission = null;
                // because there was no devices
                this.hasDevices.next(false);
                // tells the listener about the error
                this.camerasNotFound.next(err);
                break;
            case 'NotReadableError':
                console.warn('@zxing/ngx-scanner', 'Couldn\'t read the device(s)\'s stream, it\'s probably in use by another app.');
                // no permissions claimed
                permission = null;
                // there are devices, which I couldn't use
                this.hasDevices.next(false);
                // tells the listener about the error
                this.camerasNotFound.next(err);
                break;
            default:
                console.warn('@zxing/ngx-scanner', 'I was not able to define if I have permissions for camera or not.', err);
                // unknown
                permission = null;
                // this.hasDevices.next(undefined;
                break;
        }
        this.setPermission(permission);
        // tells the listener about the error
        this.permissionResponse.error(err);
        return permission;
    }
    /**
     * Returns a valid BarcodeFormat or fails.
     */
    getBarcodeFormatOrFail(format) {
        return typeof format === 'string'
            ? BarcodeFormat[format.trim().toUpperCase()]
            : format;
    }
    /**
     * Retorna um code reader, cria um se nenhume existe.
     */
    getCodeReader() {
        if (!this._codeReader) {
            const options = {
                delayBetweenScanAttempts: this.timeBetweenScans,
                delayBetweenScanSuccess: this.delayBetweenScanSuccess,
            };
            this._codeReader = new BrowserMultiFormatContinuousReader(this.hints, options);
        }
        return this._codeReader;
    }
    /**
     * Starts the continuous scanning for the given device.
     *
     * @param deviceId The deviceId from the device.
     */
    scanFromDevice(deviceId) {
        return __awaiter(this, void 0, void 0, function* () {
            const videoElement = this.previewElemRef.nativeElement;
            const codeReader = this.getCodeReader();
            const scanStream = yield codeReader.scanFromDeviceObservable(deviceId, videoElement);
            if (!scanStream) {
                throw new Error('Undefined decoding stream, aborting.');
            }
            const next = (x) => this._onDecodeResult(x.result, x.error);
            const error = (err) => this._onDecodeError(err);
            const complete = () => { };
            this._scanSubscription = scanStream.subscribe(next, error, complete);
            if (this._scanSubscription.closed) {
                return;
            }
            const controls = codeReader.getScannerControls();
            const hasTorchControl = typeof controls.switchTorch !== 'undefined';
            this.torchCompatible.next(hasTorchControl);
        });
    }
    /**
     * Handles decode errors.
     */
    _onDecodeError(err) {
        this.dispatchScanError(err);
        // this.reset();
    }
    /**
     * Handles decode results.
     */
    _onDecodeResult(result, error) {
        if (result) {
            this.dispatchScanSuccess(result);
        }
        else {
            this.dispatchScanFailure(error);
        }
        this.dispatchScanComplete(result);
    }
    /**
     * Stops the code reader and returns the previous selected device.
     */
    _reset() {
        if (!this._codeReader) {
            return;
        }
        const device = this._device;
        // do not set this.device inside this method, it would create a recursive loop
        this.device = undefined;
        this._codeReader = undefined;
        return device;
    }
    /**
     * Resets the scanner and emits device change.
     */
    reset() {
        this._reset();
        this.deviceChange.emit(null);
    }
    /**
     * Sets the current device.
     */
    setDevice(device) {
        return __awaiter(this, void 0, void 0, function* () {
            // instantly stops the scan before changing devices
            this.scanStop();
            // correctly sets the new (or none) device
            this._device = device || undefined;
            if (!this._device) {
                // cleans the video because user removed the device
                BrowserCodeReader.cleanVideoSource(this.previewElemRef.nativeElement);
            }
            // if enabled, starts scanning
            if (this._enabled && device) {
                yield this.scanFromDevice(device.deviceId);
            }
        });
    }
    /**
     * Sets the permission value and emmits the event.
     */
    setPermission(hasPermission) {
        this.hasPermission = hasPermission;
        this.permissionResponse.next(hasPermission);
    }
}
ZXingScannerComponent.decorators = [
    { type: Component, args: [{
                selector: 'zxing-scanner',
                template: "<video #preview [style.object-fit]=\"previewFitMode\">\n  <p>\n    Your browser does not support this feature, please try to upgrade it.\n  </p>\n  <p>\n    Seu navegador n\u00E3o suporta este recurso, por favor tente atualiz\u00E1-lo.\n  </p>\n</video>\n",
                changeDetection: ChangeDetectionStrategy.OnPush,
                styles: [":host{display:block}video{width:100%;height:auto;-o-object-fit:contain;object-fit:contain}"]
            },] }
];
ZXingScannerComponent.ctorParameters = () => [];
ZXingScannerComponent.propDecorators = {
    previewElemRef: [{ type: ViewChild, args: ['preview', { static: true },] }],
    autofocusEnabled: [{ type: Input }],
    timeBetweenScans: [{ type: Input }],
    delayBetweenScanSuccess: [{ type: Input }],
    autostarted: [{ type: Output }],
    autostarting: [{ type: Output }],
    autostart: [{ type: Input }],
    previewFitMode: [{ type: Input }],
    torchCompatible: [{ type: Output }],
    scanSuccess: [{ type: Output }],
    scanFailure: [{ type: Output }],
    scanError: [{ type: Output }],
    scanComplete: [{ type: Output }],
    camerasFound: [{ type: Output }],
    camerasNotFound: [{ type: Output }],
    permissionResponse: [{ type: Output }],
    hasDevices: [{ type: Output }],
    device: [{ type: Input }],
    deviceChange: [{ type: Output }],
    formats: [{ type: Input }],
    videoConstraints: [{ type: Input }],
    torch: [{ type: Input }],
    enable: [{ type: Input }],
    tryHarder: [{ type: Input }]
};

class ZXingScannerModule {
}
ZXingScannerModule.decorators = [
    { type: NgModule, args: [{
                imports: [
                    CommonModule,
                    FormsModule
                ],
                declarations: [ZXingScannerComponent],
                exports: [ZXingScannerComponent],
            },] }
];

/*
 * Public API Surface of zxing-scanner
 */

/**
 * Generated bundle index. Do not edit.
 */

export { ZXingScannerComponent, ZXingScannerModule };
//# sourceMappingURL=denis_panda-ngx-scanner.js.map
