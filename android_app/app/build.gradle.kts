plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.watchanybox.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.watchanybox.app"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
        vectorDrawables { useSupportLibrary = true }
    }

    signingConfigs {
        create("release") {
            storeFile = file("../release.keystore")
            storePassword = "watchanybox"
            keyAlias = "watchanybox"
            keyPassword = "watchanybox"
            enableV1Signing = true
            enableV2Signing = true
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isMinifyEnabled = false
            isShrinkResources = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.8"
    }

    packaging {
        jniLibs {
            /* Compress the four embedded Node/V8 runtimes so the universal
               APK stays installable on real phones and emulators. */
            useLegacyPackaging = true
        }
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1,LGPL3.0,LGPL2.1,DEPENDENCIES,LICENSE,NOTICE}.txt"
        }
    }

    /* Universal multi-architecture APK: arm64-v8a, armeabi-v7a, x86, x86_64. */
    splits {
        abi {
            isEnable = true
            reset()
            include("arm64-v8a", "armeabi-v7a", "x86", "x86_64")
            isUniversalApk = true
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("androidx.activity:activity-compose:1.8.2")

    /* Material 3 + adaptive window size classes (currentWindowAdaptiveInfo). */
    val composeBom = platform("androidx.compose:compose-bom:2024.02.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material3:material3-window-size-class")
    implementation("androidx.compose.material3.adaptive:adaptive:1.0.0")

    /* Posters for the native adaptive Discover grid. */
    implementation("io.coil-kt:coil-compose:2.7.0")

    /* Media3 ExoPlayer - native player surface. */
    val media3Version = "1.3.1"
    implementation("androidx.media3:media3-exoplayer:$media3Version")
    implementation("androidx.media3:media3-exoplayer-hls:$media3Version")
    implementation("androidx.media3:media3-ui:$media3Version")
    implementation("androidx.media3:media3-datasource-okhttp:$media3Version")

    /* OkHttp: proxy probing + ExoPlayer datasource. */
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    /* Embedded Node.js 22 runtime (javet) - runs the unmodified srv2.js
       extractor/proxy inside the Android process. Includes all four ABIs. */
    implementation("com.caoccao.javet:javet-android-node:4.0.0")
}
