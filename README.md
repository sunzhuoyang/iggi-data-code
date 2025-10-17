# IGGI Supplemental Data and Code

This repository accompanies the paper **“Balancing Integrated Green‑Grey Infrastructure Shapes Carbon Emissions in Village‑Town Clusters”** and provides supplementary data and scripts used in the analysis.

## Repository Contents

- **Data_S1.xlsx** – Aggregated socio‑economic and ecological indicators for eight village‑town clusters in Zhejiang Province, China. Sensitive household‑level energy consumption values have been removed or aggregated to preserve privacy; therefore this dataset cannot be used directly to reproduce carbon calculations. Please substitute your own operational energy data or contact the corresponding author to request access to the full dataset.
- **20251008_Supplementary Document S3.pdf** – Methods S1. Includes detailed methodology for calculating net carbon emission intensity (NCEI), CASA model parameters, and remote‑sensing preprocessing steps.
- **casa_model_code.js** – Implementation of the CASA model and related functions in Google Earth Engine. Use this script along with your own input data to replicate vegetation productivity and carbon emission calculations.

## Usage

The `casa_model_code.js` file is a Google Earth Engine (GEE) script. To run the analysis:

1. Upload **casa_model_code.js** to your GEE account or paste it into the code editor.
2. Provide your own Sentinel‑2 imagery, climate data, and operational energy consumption values for each village‑town cluster.
3. Adjust file paths and any hard‑coded parameters as needed, then run the script to calculate NPP, NEP, and NCEI for your region of interest.

Because **Data_S1.xlsx** contains only aggregated statistics and excludes the underlying energy‑consumption data, you must supply your own activity data to reproduce the study's net carbon emission estimates.

## Citation

When using this repository, please cite our paper and reference this repository with its URL. Example:

> Sun, Z.-Y., & Zhu, X.Q. (2025). Balancing Integrated Green‑Grey Infrastructure Shapes Carbon Emissions in Village‑Town Clusters. *iScience*. Supplementary data and code available at https://github.com/sunzhuoyang/iggi-data-code-clean

Optionally, archive a specific release of this repository (e.g., via Zenodo) and cite the DOI.

## License

The code in this repository is released under the MIT License. Data_S1.xlsx is released for research use only. Contact the authors for other uses.

## Contact

For questions about the data or code, please contact the corresponding author: Xiaoqing Zhu (zxq@zjut.edu.cn).
