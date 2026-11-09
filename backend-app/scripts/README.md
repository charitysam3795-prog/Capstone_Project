# Backend utility scripts

These scripts are manual maintenance tools and are not part of normal web requests.

- `imports/` contains one-off curriculum importers.
- `maintenance/` contains cleanup, repair, and sample-data utilities.

Review each script and back up the database before running anything that changes data. Run scripts from the `backend-app` directory using their full path, for example:

```powershell
php scripts/imports/import_accountancy_curriculum.php
php scripts/maintenance/cleanup_duplicate_subjects.php --dry-run
```
