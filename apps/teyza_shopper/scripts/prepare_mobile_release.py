"""Configure generated Flutter wrappers without committing signing credentials."""
import argparse
import base64
import json
import os
from pathlib import Path
import plistlib
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ANDROID_ID = "za.co.teyza.shopper"
ANDROID_TEMPLATE_ID = "za.co.teyza.teyza_shopper"
IOS_ID = os.environ.get("TEYZA_IOS_BUNDLE_ID") or "za.co.teyza.shopper"
FIREBASE_API_KEY = "AIzaSyC0dFsNcfwuYUbdCN6K2xrG3Ycx6tPvl_U"
NATIVE_CONFIG = ROOT / "assets/config/firebase_native.json"


def native_app_id(platform):
    value = os.environ.get("TEYZA_FIREBASE_" + platform.upper() + "_APP_ID", "").strip()
    if not value:
        config = json.loads(NATIVE_CONFIG.read_text())
        if config.get("projectId") != "business-lift-3c19c":
            raise SystemExit("Unexpected bundled Firebase project.")
        value = config.get(platform + "AppId", "")
    if value and not re.fullmatch(r"1:983479810697:" + platform + r":[a-fA-F0-9]+", value):
        raise SystemExit("Use the existing project's native " + platform + " Firebase app ID.")
    return value


def android(signing):
    if signing == 'signed':
        encoded = os.environ.get('TEYZA_ANDROID_GOOGLE_SERVICES_JSON_BASE64', '')
        if not encoded:
            raise SystemExit('Run CONNECT-PLAY-PACKAGE.ps1 before signing: the Play package needs its matching Firebase registration.')
        validate_android_sdk(encoded)
    path = ROOT / "android/app/src/main/AndroidManifest.xml"
    ET.register_namespace("android", "http://schemas.android.com/apk/res/android")
    tree = ET.parse(path)
    manifest = tree.getroot()
    key = "{http://schemas.android.com/apk/res/android}"
    for permission in ("INTERNET", "ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION", "CAMERA", "POST_NOTIFICATIONS"):
        name = "android.permission." + permission
        if not any(p.get(key + "name") == name for p in manifest.findall("uses-permission")):
            ET.SubElement(manifest, "uses-permission", {key + "name": name})
    # Teyza uses provider login, not advertising identifiers. Remove permissions
    # contributed by dependencies from the final merged manifest.
    tools = "{http://schemas.android.com/tools}"
    ET.register_namespace("tools", "http://schemas.android.com/tools")
    for name in (
        "com.google.android.gms.permission.AD_ID",
        "android.permission.ACCESS_ADSERVICES_AD_ID",
        "android.permission.ACCESS_ADSERVICES_ATTRIBUTION",
        "android.permission.ACCESS_ADSERVICES_CUSTOM_AUDIENCE",
        "android.permission.ACCESS_ADSERVICES_TOPICS",
    ):
        for existing in list(manifest.findall("uses-permission")):
            if existing.get(key + "name") == name:
                manifest.remove(existing)
        ET.SubElement(manifest, "uses-permission", {key + "name": name, tools + "node": "remove"})
    manifest.find("application").set(key + "label", "Teyza")
    main = next((a for a in manifest.find("application").findall("activity")
                 if a.get(key + "name", "").endswith("MainActivity")), None)
    if main is None:
        raise SystemExit("Cannot locate the Android activity for Firebase browser return.")
    # Keep the generated Kotlin namespace; explicitly address its activity while
    # the installed applicationId follows the existing Play Console app.
    if main.get(key + 'name') == '.MainActivity':
        main.set(key + 'name', ANDROID_TEMPLATE_ID + '.MainActivity')
    # Flutter's empty task affinity separates the browser callback activity from
    # the app's task. Firebase's SDK must receive its own reCAPTCHA intent and
    # return to the same Flutter activity; do not intercept that URI in Dart.
    if main.get(key + "taskAffinity") == "":
        del main.attrib[key + "taskAffinity"]
    for name, value in [("firebase_messaging_auto_init_enabled", "false"),
                        ("firebase_analytics_collection_enabled", "false")]:
        ET.SubElement(manifest.find("application"), "meta-data", {key + "name": name, key + "value": value})
    ET.SubElement(manifest, "uses-feature", {key + "name": "android.hardware.camera", key + "required": "false"})
    tree.write(path, encoding="utf-8", xml_declaration=True)
    app_id = native_app_id("android")
    if app_id:
        # FirebaseInitProvider needs resources before Dart starts, including for
        # OS-displayed notifications when the app process is not running.
        resources = ET.Element("resources")
        for name, value in {"google_app_id":app_id, "google_api_key":FIREBASE_API_KEY,
                            "gcm_defaultSenderId":"983479810697", "project_id":"business-lift-3c19c",
                            "google_storage_bucket":"business-lift-3c19c.firebasestorage.app"}.items():
            ET.SubElement(resources, "string", {"name":name, "translatable":"false"}).text = value
        config = ROOT / "android/app/src/main/res/values/teyza_firebase.xml"
        config.parent.mkdir(parents=True, exist_ok=True)
        ET.ElementTree(resources).write(config, encoding="utf-8", xml_declaration=True)
    gradle = ROOT / "android/app/build.gradle.kts"
    source = gradle.read_text()
    expected = re.findall(r'applicationId\s*=\s*"([^"]+)"', source)
    if len(expected) != 1 or expected[0] not in (ANDROID_TEMPLATE_ID, ANDROID_ID):
        raise SystemExit("Unexpected generated Android application ID.")
    source = re.sub(r'applicationId\s*=\s*"[^"]+"', 'applicationId = "' + ANDROID_ID + '"', source)
    source = source.replace("minSdk = flutter.minSdkVersion", "minSdk = maxOf(24, flutter.minSdkVersion)")
    if signing != "test":
        replacement = "signingConfig = null // Unsigned preparation bundle; never a debug upload key."
        if signing == "signed":
            required = ["TEYZA_ANDROID_KEYSTORE_PATH", "TEYZA_ANDROID_STORE_PASSWORD",
                        "TEYZA_ANDROID_KEY_ALIAS", "TEYZA_ANDROID_KEY_PASSWORD"]
            if any(not os.environ.get(key) for key in required):
                raise SystemExit("Android upload signing configuration is incomplete.")
            config = '''
    signingConfigs {
        create("upload") {
            storeFile = file(System.getenv("TEYZA_ANDROID_KEYSTORE_PATH"))
            storePassword = System.getenv("TEYZA_ANDROID_STORE_PASSWORD")
            keyAlias = System.getenv("TEYZA_ANDROID_KEY_ALIAS")
            keyPassword = System.getenv("TEYZA_ANDROID_KEY_PASSWORD")
        }
    }
'''
            source = source.replace("    buildTypes {", config + "\n    buildTypes {", 1)
            replacement = 'signingConfig = signingConfigs.getByName("upload")'
        source, count = re.subn(r'signingConfig\s*=\s*signingConfigs\.getByName\("debug"\)',
                                replacement, source)
        if count != 1:
            raise SystemExit("Expected one Flutter template signing entry; refusing an ambiguous release.")
    gradle.write_text(source)
    print("Android identity:", ANDROID_ID, "| signing:", signing)


def validate_android_sdk(encoded):
    try:
        sdk = json.loads(base64.b64decode(encoded, validate=True))
    except (ValueError, TypeError):
        raise SystemExit('Invalid saved Android Firebase SDK configuration.')
    if sdk.get('project_info', {}).get('project_id') != 'business-lift-3c19c':
        raise SystemExit('Android Firebase SDK belongs to another project.')
    clients = [c for c in sdk.get('client', []) if
               c.get('client_info', {}).get('android_client_info', {}).get('package_name') == ANDROID_ID]
    if len(clients) != 1:
        raise SystemExit('Android Firebase SDK does not match za.co.teyza.shopper.')
    app_id = clients[0]['client_info'].get('mobilesdk_app_id')
    if not app_id or app_id != native_app_id('android'):
        raise SystemExit('Android Firebase app ID and saved SDK configuration differ. Run CONNECT-PLAY-PACKAGE.ps1.')
    return app_id


def ios():
    if not re.fullmatch(r"[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+){2,}", IOS_ID):
        raise SystemExit("TEYZA_IOS_BUNDLE_ID must be an Apple bundle identifier.")
    path = ROOT / "ios/Runner/Info.plist"
    with path.open("rb") as file:
        info = plistlib.load(file)
    info.update({
        "CFBundleDisplayName": "Teyza",
        "CFBundleName": "Teyza",
        "NSCameraUsageDescription": "Photograph your ID, passport or company registration, take an owner selfie, or photograph your shop products.",
        "NSPhotoLibraryUsageDescription": "Choose a private seller registration document photo or a product photo for your shop catalogue.",
        "NSLocationWhenInUseUsageDescription": "Use your location to find nearby shops or, when you are at your shop, save its map pin. You can also enter a location manually.",
        "UIBackgroundModes": ["fetch", "remote-notification"],
        "FirebaseMessagingAutoInitEnabled": False,
        "FirebaseAnalyticsCollectionEnabled": False,
    })
    app_id = native_app_id("ios")
    if app_id:
        info["TeyzaFirebaseAppId"] = app_id
        # Same encoded scheme used by Firebase iOS PhoneAuthProvider.swift.
        info.setdefault("CFBundleURLTypes", []).append({"CFBundleTypeRole":"Editor",
            "CFBundleURLSchemes":["app-" + app_id.replace(":", "-")]})
        delegate = ROOT / "ios/Runner/AppDelegate.swift"
        source = delegate.read_text()
        marker = "return super.application(application, didFinishLaunchingWithOptions: launchOptions)"
        if marker not in source:
            raise SystemExit("Cannot locate iOS startup to configure background push safely.")
        bootstrap = '''if FirebaseApp.app() == nil,
      let appId = Bundle.main.object(forInfoDictionaryKey: "TeyzaFirebaseAppId") as? String {
      let options = FirebaseOptions(googleAppID: appId, gcmSenderID: "983479810697")
      options.apiKey = "''' + FIREBASE_API_KEY + '''"
      options.projectID = "business-lift-3c19c"
      options.storageBucket = "business-lift-3c19c.firebasestorage.app"
      FirebaseApp.configure(options: options)
    }
    '''
        delegate.write_text("import FirebaseCore\n" + source.replace(marker, bootstrap + marker, 1))
    ios_client = os.environ.get("TEYZA_GOOGLE_IOS_CLIENT_ID", "").strip()
    web_client = os.environ.get("TEYZA_GOOGLE_WEB_CLIENT_ID", "").strip()
    if ios_client and web_client:
        if not ios_client.endswith(".apps.googleusercontent.com"):
            raise SystemExit("Use the registered iOS Google OAuth client ID.")
        info["GIDClientID"] = ios_client
        info["GIDServerClientID"] = web_client
        info.setdefault("CFBundleURLTypes", []).append({"CFBundleTypeRole":"Editor", "CFBundleURLSchemes":[
            "com.googleusercontent.apps."+ios_client.split(".apps.googleusercontent.com")[0]]})
    with path.open("wb") as file:
        plistlib.dump(info, file, sort_keys=False)
    entitlements = ROOT / "ios/Runner/Runner.entitlements"
    with entitlements.open("wb") as file:
        plistlib.dump({"com.apple.developer.applesignin":["Default"], "aps-environment":"production"}, file)
    project = ROOT / "ios/Runner.xcodeproj/project.pbxproj"
    source = project.read_text()
    source = re.sub(r"PRODUCT_BUNDLE_IDENTIFIER = [^;]+;",
                    lambda m: "PRODUCT_BUNDLE_IDENTIFIER = " + IOS_ID +
                    (".RunnerTests" if "RunnerTests" in m.group() else "") + ";", source)
    source = source.replace("INFOPLIST_FILE = Runner/Info.plist;",
        "INFOPLIST_FILE = Runner/Info.plist;\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = Runner/Runner.entitlements;")
    source = re.sub(r"IPHONEOS_DEPLOYMENT_TARGET = [^;]+;", "IPHONEOS_DEPLOYMENT_TARGET = 15.0;", source)
    project.write_text(source)
    podfile = ROOT / "ios/Podfile"
    if podfile.exists():
        source = podfile.read_text()
        source = re.sub(r"#?\s*platform :ios, '[^']+'", "platform :ios, '15.0'", source)
        marker = "flutter_additional_ios_build_settings(target)"
        bypass = '''
    target.build_configurations.each do |config|
      config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']
      config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << 'BYPASS_PERMISSION_LOCATION_ALWAYS=1'
    end'''
        source = source.replace(marker, marker + bypass, 1)
        podfile.write_text(source)
    print("iOS bundle:", IOS_ID, "| Apple capability, Google OAuth configuration and owner camera access")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("platform", choices=["android", "ios"])
    parser.add_argument("--signing", choices=["test", "unsigned", "signed"], default="unsigned")
    args = parser.parse_args()
    if args.platform == "android":
        android(args.signing)
    else:
        ios()


    from configure_facebook import configure
    configure(ROOT,args.platform)
