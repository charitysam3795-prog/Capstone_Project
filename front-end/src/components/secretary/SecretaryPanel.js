import React from 'react';
import CurriculumStaffPortal from '../common/CurriculumStaffPortal';

const SecretaryPanel = () => (
  <CurriculumStaffPortal
    expectedRole="Secretary"
    sidebarVariant="secretary"
    collapsedStorageKey="portalSidebarCollapsed_secretary"
    sidebarBrand="Secretary portal"
    workspaceTitle="Secretary workspace"
    roleChipLabel="Secretary"
  />
);

export default SecretaryPanel;
