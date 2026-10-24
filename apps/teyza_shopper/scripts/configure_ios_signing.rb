# Runner only: never apply the distribution profile to dependency bundles.
require 'xcodeproj'
profile = Xcodeproj::Plist.read_from_path(ENV.fetch('TEYZA_IOS_PROFILE_PLIST'))
team = ENV.fetch('TEYZA_APPLE_TEAM_ID')
bundle = ENV.fetch('TEYZA_IOS_BUNDLE_ID')
abort 'Profile belongs to a different Apple team' unless profile['TeamIdentifier'].include?(team)
abort 'Profile does not match the Teyza bundle ID' unless profile['Entitlements']['application-identifier'] == "#{profile['ApplicationIdentifierPrefix'].first}.#{bundle}"
abort 'Profile is not for App Store distribution' if profile['ProvisionedDevices'] || profile['ProvisionsAllDevices'] || profile['Entitlements']['get-task-allow']
abort 'Enable Sign in with Apple on the App ID and regenerate the App Store profile' unless (profile['Entitlements']['com.apple.developer.applesignin'] || []).include?('Default')
project = Xcodeproj::Project.open('ios/Runner.xcodeproj')
project.targets.find { |target| target.name == 'Runner' }.build_configurations.each do |config|
  config.build_settings['DEVELOPMENT_TEAM'] = team
  config.build_settings['CODE_SIGN_STYLE'] = 'Manual'
  config.build_settings['CODE_SIGN_IDENTITY'] = 'Apple Distribution'
  config.build_settings['PROVISIONING_PROFILE_SPECIFIER'] = profile['Name']
end
project.save
options = {'method'=>'app-store-connect', 'teamID'=>team, 'signingStyle'=>'manual',
           'signingCertificate'=>'Apple Distribution',
           'provisioningProfiles'=>{bundle=>profile['Name']}, 'uploadSymbols'=>true}
Xcodeproj::Plist.write_to_path(options, 'ios/ExportOptions.plist')
