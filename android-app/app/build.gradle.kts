plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.kvnitagartala.studentapp"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.kvnitagartala.studentapp"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
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
        buildConfig = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.2")
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("com.google.android.gms:play-services-auth:21.2.0")
}

// Keep dashboard web assets in sync with ../browser-app on each build (includes sheets-webapp-config.js — paste Web app URL there only).
tasks.register<Copy>("copyBrowserApp") {
    val src = rootProject.projectDir.resolve("../browser-app")
    if (!src.exists()) {
        throw GradleException("Missing ../browser-app — copy your web dashboard there or sync the repo.")
    }
    from(src) {
        include("**/*")
        exclude("**/.DS_Store")
    }
    into(layout.projectDirectory.dir("src/main/assets/browser-app"))
    duplicatesStrategy = DuplicatesStrategy.INCLUDE
}

tasks.named("preBuild").configure {
    dependsOn("copyBrowserApp")
}
