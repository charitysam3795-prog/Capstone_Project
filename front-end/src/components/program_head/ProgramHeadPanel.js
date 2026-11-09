import React from 'react';
import CurriculumStaffPortal from '../common/CurriculumStaffPortal';

const ProgramHeadPanel = () => (
  <CurriculumStaffPortal
    expectedRole="Program Head"
    sidebarVariant="program-head"
    collapsedStorageKey="portalSidebarCollapsed_program_head"
    sidebarBrand="Program head portal"
    workspaceTitle="Program head workspace"
    roleChipLabel="Program head"
  />
);

export default ProgramHeadPanel;
