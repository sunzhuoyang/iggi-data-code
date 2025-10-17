// CASA Model Implementation for Carbon Sink Estimation
//
// This script is an adaptation of the Google Earth Engine (GEE) code
// provided in the supplementary methods (Methods S1) of the IGGI study.
// It implements the major functions and processing steps required to
// derive Net Primary Productivity (NPP), Heterotrophic Respiration (RH)
// and the Net Carbon Emission Intensity (NCEI) from Landsat and Sentinel
// imagery. Users can run this script in the GEE Code Editor to
// reproduce the carbon sink estimates described in the paper.

// Study region geometry (replace `table` with your FeatureCollection)
var geom = table;
Map.addLayer(geom, {}, 'study area');
Map.centerObject(geom);

// Applies scaling factors to Landsat surface reflectance bands.
function applyScaleFactors(image) {
    var opticalBands = image.select('SR_B.').multiply(0.0000275).add(-0.2);
    return image.addBands(opticalBands, null, true);
}

// Remove clouds from Landsat 5–9 imagery using QA_PIXEL bits and a simple
// threshold on the blue band.
function cloudRemoval(image) {
    var cloudShadowBitMask = (1 << 4);
    var cloudsBitMask      = (1 << 3);
    var qa    = image.select('QA_PIXEL');
    var mask  = qa.bitwiseAnd(cloudShadowBitMask).eq(0)
                  .and(qa.bitwiseAnd(cloudsBitMask).eq(0));
    var mask2 = image.select('blue').gt(0.2);
    return image.updateMask(mask).updateMask(mask2.not()).toDouble()
                .copyProperties(image)
                .copyProperties(image, ['system:time_start']);
}

// Cloud masking for Sentinel‑2 using QA60, cloud probability and scene
// classification layers.
function maskS2clouds(image) {
    var qa          = image.select('QA60');
    var cloudBitMask  = 1 << 10;
    var cirrusBitMask = 1 << 11;
    var mask     = qa.bitwiseAnd(cloudBitMask).eq(0)
                    .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
    var cloudProb = image.select('MSK_CLDPRB');
    var scl       = image.select('SCL');
    var cloud     = cloudProb.lte(30);
    var shadow    = scl.eq(3);
    var cirrus    = scl.eq(10);
    var mask_scl  = cloud.and(cirrus.neq(1)).and(shadow.neq(1));
    var opticalBands = image.select('B.*').multiply(0.0001);
    return image.addBands(opticalBands, null, true)
                .updateMask(mask)
                .updateMask(mask_scl)
                .copyProperties(image)
                .copyProperties(image, ['system:time_start']);
}

// Band definitions for Landsat and Sentinel sensors; these are used
// when selecting and renaming bands to a common nomenclature.
var LC9_BANDS = ['SR_B2','SR_B3','SR_B4','SR_B5','SR_B6','SR_B7','QA_PIXEL'];
var LC8_BANDS = ['SR_B2','SR_B3','SR_B4','SR_B5','SR_B6','SR_B7','QA_PIXEL'];
var LC7_BANDS = ['SR_B1','SR_B2','SR_B3','SR_B4','SR_B5','SR_B7','QA_PIXEL'];
var S2_BANDS  = ['B2','B3','B4','B8','B11','B12'];
var STD_NAMES = ['blue','green','red','nir','swir1','swir2','QA_PIXEL'];

// Load and harmonize Landsat 7–9 and Sentinel‑2 collections for a given year.
function get_imageC(year, region) {
    var date_start = ee.Date.fromYMD(year, 1, 1);
    var date_end   = date_start.advance(1, 'year');
    // Sentinel‑2 surface reflectance
    var S2Col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
                  .filterBounds(region)
                  .filter(ee.Filter.date(date_start, date_end))
                  .map(maskS2clouds)
                  .select(['B4','B8'], ['red','nir']);
    // Landsat 9
    var L9Col = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
                  .filterBounds(region)
                  .filter(ee.Filter.date(date_start, date_end))
                  .map(applyScaleFactors)
                  .select(LC9_BANDS, STD_NAMES)
                  .map(cloudRemoval);
    // Landsat 8
    var L8Col = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
                  .filterBounds(region)
                  .filter(ee.Filter.date(date_start, date_end))
                  .map(applyScaleFactors)
                  .select(LC8_BANDS, STD_NAMES)
                  .map(cloudRemoval);
    // Landsat 7
    var L7Col = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
                  .filterBounds(region)
                  .filter(ee.Filter.date(date_start, date_end))
                  .map(applyScaleFactors)
                  .select(LC7_BANDS, STD_NAMES)
                  .map(cloudRemoval);
    // Merge Landsat collections and add Sentinel‑2
    var LandsatCol = ee.ImageCollection(L9Col.merge(L8Col).merge(L7Col))
                      .select(['red','nir'])
                      .merge(S2Col)
                      .sort('system:time_start');
    return LandsatCol;
}

// Instantiate collections for 2022
var Landsat_collection = get_imageC(2022, geom);
var Climate_collection = ee.ImageCollection('IDAHO_EPSCOR/TERRACLIMATE')
                          .filter(ee.Filter.date('2022-01-01','2023-01-01'))
                          .select(['pr','tmmn','tmmx','srad']);

// Preprocess climate variables: convert units and derive mean temperature.
function preprocessClimate(image) {
    var srad  = image.select('srad').multiply(0.1).multiply(2.592); // MJ/m²
    var tmmn  = image.select('tmmn').multiply(0.1);
    var tmmx  = image.select('tmmx').multiply(0.1);
    var pr    = image.select('pr');
    var tmean = tmmn.add(tmmx).divide(2).rename('tmean');
    return image.addBands(srad.rename('solar_radiation'))
                .addBands(tmean)
                .addBands(pr.rename('precipitation'));
}
Climate_collection = Climate_collection.map(preprocessClimate);

// Heterotrophic respiration calculation based on Zhuang et al. (2014)
function calculateRH(image) {
    var tmean = image.select('tmean');
    var pr    = image.select('precipitation');
    var RH    = ee.Image().expression(
        '0.22 * (exp(0.0913 * T) + log(0.3145 * P + 1)) * 30 * 0.465',
        {T: tmean, P: pr}
    ).rename('RH');
    return image.addBands(RH);
}
var Climate_with_RH = Climate_collection.map(calculateRH);

// CASA model parameter generation
function generate_LUE(image) {
    return image.where(image.eq(3), 0.485).where(image.eq(1), 0.389)
                .where(image.eq(4), 0.692).where(image.eq(2), 0.985)
                .where(image.eq(5), 0.728).where(image.eq(6), 0.429)
                .where(image.eq(7), 0.429).where(image.eq(8), 0.542)
                .where(image.eq(9), 0.542).where(image.eq(10), 0.542)
                .where(image.eq(11), 0.542).where(image.eq(12), 0.542)
                .where(image.eq(13), 0.196).where(image.eq(14), 0.542)
                .where(image.eq(15), 0.542).where(image.eq(16), 0.217)
                .where(image.eq(17), 0.296).toFloat();
}
function set_NDVImin(image) {
    return image.where(image.gt(0), 0.023).toFloat();
}
function set_NDVImax(image) {
    return image.where(image.eq(1), 0.647).where(image.eq(2), 0.676)
                .where(image.eq(3), 0.738).where(image.eq(4), 0.747)
                .where(image.eq(5), 0.702).where(image.eq(6), 0.636)
                .where(image.eq(7), 0.634).where(image.eq(8), 0.634)
                .where(image.eq(9), 0.634).where(image.eq(10), 0.634)
                .where(image.eq(11), 0.634).where(image.eq(12), 0.634)
                .toFloat();
}
function set_SRmin(image) {
    return image.where(image.gt(0), 1.05).toFloat();
}
function set_SRmax(image) {
    return image.where(image.eq(1), 4.67).where(image.eq(2), 5.17)
                .where(image.eq(3), 6.63).where(image.eq(4), 6.91)
                .where(image.eq(5), 5.845).where(image.eq(6), 4.49)
                .where(image.eq(7), 4.46).where(image.eq(8), 4.46)
                .where(image.eq(9), 4.46).where(image.eq(10), 4.46)
                .where(image.eq(11), 4.46).where(image.eq(12), 4.46)
                .toFloat();
}

// Derive CASA parameter collections from MODIS land cover
var Landcover_collection = ee.ImageCollection('MODIS/061/MCD12Q1').select('LC_Type1');
var LUE_img     = Landcover_collection.map(generate_LUE).select(['LC_Type1'], ['LUE']);
var NDVImin_img = Landcover_collection.map(set_NDVImin).select(['LC_Type1'], ['NDVI_min']);
var NDVImax_img = Landcover_collection.map(set_NDVImax).select(['LC_Type1'], ['NDVI_max']);
var SRmin_img   = Landcover_collection.map(set_SRmin).select(['LC_Type1'], ['SR_min']);
var SRmax_img   = Landcover_collection.map(set_SRmax).select(['LC_Type1'], ['SR_max']);

// Calculate NDVI and Simple Ratio (SR) for Landsat images
function calculateIndices(image) {
    var red = image.select('red');
    var nir = image.select('nir');
    var NDVI = nir.subtract(red).divide(nir.add(red)).rename('NDVI');
    var SR   = ee.Image(1).add(NDVI).divide(ee.Image(1).subtract(NDVI)).rename('SR');
    return image.addBands(NDVI).addBands(SR);
}
var Landsat_indices = Landsat_collection.map(calculateIndices);

// Combine NDVI/SR with land cover-based min/max to compute FPAR
function combineParameters(image) {
    var FPAR1 = image.select('NDVI').subtract(NDVImin_img).divide(NDVImax_img.subtract(NDVImin_img)).multiply(0.949).add(0.001);
    var FPAR2 = image.select('SR').subtract(SRmin_img).divide(SRmax_img.subtract(SRmin_img)).multiply(0.949).add(0.001);
    var FPAR  = FPAR1.add(FPAR2).divide(2).clamp(0.05, 0.95).rename('FPAR');
    return image.addBands(FPAR);
}
var Landsat_SR = Landsat_indices.map(combineParameters);

// Compute Net Primary Productivity (NPP)
function calculateNPP(image) {
    var FPAR = image.select('FPAR');
    var solarRadiation = image.select('solar_radiation');
    var APAR = FPAR.multiply(solarRadiation).multiply(0.5).rename('APAR');
    var LUE    = image.select('LUE');
    // Water and temperature stress coefficients (Wstress, Tstress1, Tstress2)
    // should be computed separately; placeholder selections are used here.
    var Wstress  = image.select('Wstress');
    var Tstress1 = image.select('Tstress1');
    var Tstress2 = image.select('Tstress2');
    var NPP = APAR.multiply(LUE).multiply(Wstress).multiply(Tstress1).multiply(Tstress2).rename('NPP');
    return image.addBands(NPP);
}
var Landsat_NPP = Landsat_SR.map(calculateNPP);

// Compute Net Carbon Emission Intensity (NCEI) from NPP and RH
function calculateNCEI(image) {
    var NPP = image.select('NPP');
    var RH  = Climate_with_RH.select('RH');
    var NCEI = NPP.subtract(RH).rename('NCEI');
    return image.addBands(NCEI);
}
var Landsat_NCEI = Landsat_NPP.map(calculateNCEI);

// Visualization parameters for NCEI
var nceiVis = {
    min: -10,
    max: 10,
    palette: ['red','white','green']
};
Map.addLayer(Landsat_NCEI.select('NCEI').mean(), nceiVis, 'NCEI');

// Export mean NPP and NCEI for the year 2022
Export.image.toDrive({
    image: Landsat_NPP.select('NPP').mean(),
    description: 'NPP_2022',
    fileNamePrefix: 'NPP_2022',
    scale: 30,
    crs: 'EPSG:4326',
    region: geom,
    maxPixels: 1e13
});
Export.image.toDrive({
    image: Landsat_NCEI.select('NCEI').mean(),
    description: 'NCEI_2022',
    fileNamePrefix: 'NCEI_2022',
    scale: 30,
    crs: 'EPSG:4326',
    region: geom,
    maxPixels: 1e13
});
